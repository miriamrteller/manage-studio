import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { SortOrder } from '@/lib/list-query';
import { PersonSchema, type Person } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';
import {
  ageRangeToDobBounds,
  DEFAULT_PERSON_SORT,
  personSortOrderForField,
  type PersonSortField,
} from '@/features/students/lib/personSort';
import { resolveEnrolledPersonIds } from '@/features/students/lib/resolveEnrolledPersonIds';

export interface ListPeopleFilters {
  page?: number;
  pageSize?: number;
  status?: 'active' | 'inactive' | 'all';
  searchQuery?: string;
  accountIds?: string[];
  classIds?: string[];
  categoryIds?: string[];
  minAge?: number | null;
  maxAge?: number | null;
  sortField?: PersonSortField;
  sortOrder?: SortOrder;
  /** Pre-resolved enrolled person IDs (from class/level filter). Pass [] for no matches. */
  enrolledPersonIds?: string[] | null;
  /** Limit to students: family children or anyone with an active enrolment. */
  studentListOnly?: boolean;
  /** Required when studentListOnly — all person IDs with any active enrolment. */
  allEnrolledPersonIds?: string[];
}

// Validation schema for person creation/update (without system fields)
const PersonInputSchema = z.object({
  name: z.string().min(1, 'Name required').optional(),
  email: z.string().email('Invalid email').nullable().optional(),
  date_of_birth: z.string().date('Invalid date format').nullable().optional(),
  medical_notes: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  photo_consent: z.boolean().optional(),
  media_consent: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'withdrawn']).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

const ParentPersonInputSchema = PersonInputSchema.omit({ status: true });

function normalizePersonPayload(data: z.infer<typeof PersonInputSchema>) {
  const payload = { ...data };
  if (payload.email === '') payload.email = null;
  if (payload.date_of_birth === '') payload.date_of_birth = null;
  if (payload.medical_notes === '') payload.medical_notes = null;
  if (payload.allergies === '') payload.allergies = null;
  if (payload.emergency_contact_name === '') payload.emergency_contact_name = null;
  if (payload.emergency_contact_phone === '') payload.emergency_contact_phone = null;
  return payload;
}

/**
 * PersonService: All person data operations
 * - Validates input/output with PersonSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class PersonService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const { page = 1, pageSize = 20 } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const { data, error, count } = await TenantDB.selectFor('people', tenant, {
        count: 'exact',
      })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        people: (data || []).map(p => PersonSchema.parse(p)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'PersonService.list');
  }

  static async listWithFilters(tenant: Tenant, options: ListPeopleFilters = {}) {
    const {
      page = 1,
      pageSize = 50,
      status = 'active',
      searchQuery = '',
      accountIds = [],
      classIds = [],
      categoryIds = [],
      minAge = null,
      maxAge = null,
      sortField = DEFAULT_PERSON_SORT.field,
      sortOrder = DEFAULT_PERSON_SORT.order,
      enrolledPersonIds: enrolledPersonIdsOverride,
      studentListOnly = false,
      allEnrolledPersonIds = [],
    } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const enrolledPersonIds =
        enrolledPersonIdsOverride !== undefined
          ? enrolledPersonIdsOverride
          : await resolveEnrolledPersonIds(tenant, { classIds, categoryIds });

      if (enrolledPersonIds !== null && enrolledPersonIds.length === 0) {
        return { people: [], total: 0, page, pageSize };
      }

      const dbSortOrder = personSortOrderForField(sortField, sortOrder);
      const ascending = dbSortOrder === 'asc';

      let query = TenantDB.selectFor('people', tenant, { count: 'exact' })
        .order(sortField, { ascending, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (sortField !== 'name') {
        query = query.order('name', { ascending: true });
      }

      if (status !== 'all') {
        query = query.eq('status', status);
      }
      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }
      if (accountIds.length > 0) {
        query = query.in('account_id', accountIds);
      }
      if (studentListOnly) {
        if (allEnrolledPersonIds.length === 0) {
          query = query.not('account_id', 'is', null);
        } else {
          query = query.or(
            `account_id.not.is.null,id.in.(${allEnrolledPersonIds.join(',')})`
          );
        }
      }
      if (enrolledPersonIds !== null && enrolledPersonIds.length > 0) {
        query = query.in('id', enrolledPersonIds);
      }

      const dobBounds = ageRangeToDobBounds(minAge, maxAge);
      if (dobBounds.maxDob) {
        query = query.lte('date_of_birth', dobBounds.maxDob);
      }
      if (dobBounds.minDob) {
        query = query.gte('date_of_birth', dobBounds.minDob);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        people: (data || []).map((p: unknown) => PersonSchema.parse(p)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'PersonService.listWithFilters');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Person not found');

      return PersonSchema.parse(data);
    }, 'PersonService.get');
  }

  static async create(tenant: Tenant, personData: Partial<Person>) {
    const validated = normalizePersonPayload(PersonInputSchema.parse(personData));

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('people', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = PersonSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'people', result.id);
      return result;
    }, 'PersonService.create');
  }

  static async update(tenant: Tenant, id: string, personData: Partial<Person>) {
    const validated = normalizePersonPayload(PersonInputSchema.parse(personData));

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('people', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = PersonSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'people', id);
      return result;
    }, 'PersonService.update');
  }

  /** Parent portal — same fields as admin except status (RLS-enforced). */
  static async updateForParent(tenant: Tenant, id: string, personData: Partial<Person>) {
    const validated = normalizePersonPayload(ParentPersonInputSchema.parse(personData));

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('people', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      return PersonSchema.parse(data);
    }, 'PersonService.updateForParent');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('people', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'people', id);
    }, 'PersonService.delete');
  }

  /** Admin people search — rich rows for disambiguation (name, parent, email, phone, age, class). */
  static async searchPeople(_tenant: Tenant, searchQuery: string, limit = 15) {
    const q = searchQuery.trim();
    if (!q) return [];

    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('search_enrolment_students', {
        p_query: q,
        p_limit: limit,
      });

      if (error) throw error;

      const rows = (data ?? []) as Array<{
        person: Record<string, unknown>;
        accountName: string | null;
        guardianName: string | null;
        guardianEmail: string | null;
        guardianPhone: string | null;
        emergencyContactName: string | null;
        emergencyContactPhone: string | null;
        activeClassNames: string[];
        isAccountHolder?: boolean;
        familyAccountId?: string | null;
      }>;

      return rows.map((row) => ({
        person: PersonSchema.parse(row.person),
        accountName: row.accountName ?? null,
        guardianName: row.guardianName ?? null,
        guardianEmail: row.guardianEmail ?? null,
        guardianPhone: row.guardianPhone ?? null,
        emergencyContactName: row.emergencyContactName ?? null,
        emergencyContactPhone: row.emergencyContactPhone ?? null,
        activeClassNames: row.activeClassNames ?? [],
        isAccountHolder: row.isAccountHolder ?? false,
        familyAccountId: row.familyAccountId ?? null,
      }));
    }, 'PersonService.searchPeople');
  }
}

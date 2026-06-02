import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import type { SortOrder } from '@/lib/list-query';
import { AccountSchema, AccountMemberSchema, PersonSchema, type Account, type AccountMember, type Person } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';
import {
  attachGuardianContact,
  type AccountWithContact,
} from './lib/accountContact';

export type { AccountWithContact, GuardianContactFields } from './lib/accountContact';

// Input schema for account creation — used only by EnrolmentOnboardingService.
export const FamilyInputSchema = z.object({
  name: z.string().min(1, 'Family name required').optional(),
  person_id: z.string().uuid(),
});

// Input schema for account member creation.
export const AccountMemberInputSchema = z.object({
  account_id: z.string().uuid(),
  person_id: z.string().uuid(),
  role: z.enum(['account_holder', 'member', 'sibling', 'adult_student']),
  user_profile_id: z.string().uuid().nullable().optional(),
});

export type AccountContactUpdate = {
  contact_person_name?: string;
  contact_email?: string;
  contact_phone?: string;
};

export type AccountSortField = 'name' | 'created_at';

export type AccountMemberWithPerson = AccountMember & {
  name: string;
  email: string | null;
  phone: string | null;
};

async function loadGuardiansById(tenant: Tenant, personIds: string[]): Promise<Map<string, Person>> {
  const guardiansById = new Map<string, Person>();
  if (personIds.length === 0) return guardiansById;

  const { data, error } = await TenantDB.selectFor('people', tenant).in('id', personIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const person = PersonSchema.parse(row);
    guardiansById.set(person.id, person);
  }
  return guardiansById;
}

export const DEFAULT_FAMILY_SORT: { field: AccountSortField; order: SortOrder } = {
  field: 'created_at',
  order: 'desc',
};

/**
 * FamilyService: Account data operations.
 *
 * create() and delete() are intentionally NOT on the public surface used by the
 * admin UI. They are used only by EnrolmentOnboardingService during enrolment intake
 * so that a family row is always accompanied by at least one person and a family_member.
 *
 * Hard delete is never permitted (SPEC §D, migration 039). Use anonymise RPC (future).
 */
export class FamilyService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      searchQuery?: string;
      sortField?: AccountSortField;
      sortOrder?: SortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 20,
      searchQuery = '',
      sortField = DEFAULT_FAMILY_SORT.field,
      sortOrder = DEFAULT_FAMILY_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('accounts', tenant, {
        count: 'exact',
      })
        .order(sortField, { ascending, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (sortField !== 'name') {
        query = query.order('name', { ascending: true });
      }

      if (searchQuery.trim()) {
        const q = `%${searchQuery.trim()}%`;
        query = query.ilike('name', q);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const accounts = (data || []).map((f) => AccountSchema.parse(f));
      const guardiansById = await loadGuardiansById(
        tenant,
        [...new Set(accounts.map((account) => account.person_id))],
      );

      return {
        families: accounts.map((account) =>
          attachGuardianContact(account, guardiansById.get(account.person_id)),
        ),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'FamilyService.list');
  }

  static async get(tenant: Tenant, id: string): Promise<AccountWithContact> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('accounts', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Family not found');

      const account = AccountSchema.parse(data);
      const guardiansById = await loadGuardiansById(tenant, [account.person_id]);
      return attachGuardianContact(account, guardiansById.get(account.person_id));
    }, 'FamilyService.get');
  }

  /** Get all people linked to a family (for detail view). */
  static async getPeople(tenant: Tenant, familyId: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('people', tenant)
        .eq('account_id', familyId);

      if (error) throw error;
      return data || [];
    }, 'FamilyService.getPeople');
  }

  /** Get all family_members for a family (for detail view). */
  static async getMembers(tenant: Tenant, familyId: string): Promise<AccountMemberWithPerson[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('account_members', tenant)
        .eq('account_id', familyId);

      if (error) throw error;

      const members = (data || []).map((m) => AccountMemberSchema.parse(m));
      const peopleById = await loadGuardiansById(
        tenant,
        [...new Set(members.map((member) => member.person_id))],
      );

      return members.map((member) => {
        const person = peopleById.get(member.person_id);
        return {
          ...member,
          name: person?.name ?? '—',
          email: person?.email ?? null,
          phone: person?.emergency_contact_phone ?? null,
        };
      });
    }, 'FamilyService.getMembers');
  }

  /** Update contact details on an existing family (admin-safe edit). */
  static async update(tenant: Tenant, id: string, familyData: Partial<Account>) {
    const validated = FamilyInputSchema.parse(familyData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('accounts', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = AccountSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'accounts', id);
      return result;
    }, 'FamilyService.update');
  }

  /**
   * Update family contact fields and keep guardian/parent family_members in sync.
   */
  static async updateContactWithGuardians(
    tenant: Tenant,
    familyId: string,
    contact: AccountContactUpdate,
  ): Promise<{ family: AccountWithContact; members: AccountMemberWithPerson[] }> {
    const family = await this.get(tenant, familyId);

    const guardianPatch: Record<string, string | null> = {};
    if (contact.contact_person_name !== undefined) {
      guardianPatch.name = contact.contact_person_name;
    }
    if (contact.contact_email !== undefined) {
      guardianPatch.email = contact.contact_email || null;
    }
    if (contact.contact_phone !== undefined) {
      guardianPatch.emergency_contact_phone = contact.contact_phone || null;
    }

    if (Object.keys(guardianPatch).length > 0) {
      await this.withRetry(async () => {
        const { error } = await TenantDB.update('people', tenant, family.person_id, guardianPatch);
        if (error) throw error;
        await this.logAudit(tenant, 'UPDATE', 'people', family.person_id);
      }, 'FamilyService.updateContactWithGuardians');
    }

    const members = await this.getMembers(tenant, familyId);
    const updatedFamily = await this.get(tenant, familyId);
    return { family: updatedFamily, members };
  }

  // -------------------------------------------------------------------------
  // Enrolment-only methods — called by EnrolmentOnboardingService, never by UI.
  // -------------------------------------------------------------------------

  /** @internal Used by EnrolmentOnboardingService only. */
  static async _createForEnrolment(tenant: Tenant, familyData: Partial<Account>) {
    const validated = FamilyInputSchema.parse(familyData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('accounts', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = AccountSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'accounts', result.id);
      return result;
    }, 'FamilyService._createForEnrolment');
  }

  /** @internal Used by EnrolmentOnboardingService only. */
  static async _createMemberForEnrolment(
    tenant: Tenant,
    memberData: z.infer<typeof AccountMemberInputSchema>
  ): Promise<AccountMember> {
    const validated = AccountMemberInputSchema.parse(memberData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('account_members', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      return AccountMemberSchema.parse(data);
    }, 'FamilyService._createMemberForEnrolment');
  }
}

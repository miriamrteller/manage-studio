import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { PersonSchema, type Person } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

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

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('people', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'people', id);
    }, 'PersonService.delete');
  }
}

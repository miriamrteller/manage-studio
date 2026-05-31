import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { StaffSchema, type Staff } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for teacher creation/update (without system fields)
const TeacherInputSchema = z.object({
  user_profile_id: z.string().uuid().optional(),
  name: z.string().min(1, 'Teacher name required').optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  contract_type: z.enum(['employee', 'contractor']).optional(),
  hourly_rate_minor: z.number().nonnegative().nullable().optional(),
});

/**
 * TeacherService: All teacher data operations
 * - Validates input/output with StaffSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class TeacherService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const { page = 1, pageSize = 50 } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const { data, error, count } = await TenantDB.selectFor('staff', tenant, {
        count: 'exact',
      })
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        teachers: (data || []).map(t => StaffSchema.parse(t)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'TeacherService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('staff', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Teacher not found');

      return StaffSchema.parse(data);
    }, 'TeacherService.get');
  }

  static async create(tenant: Tenant, teacherData: Partial<Staff>) {
    // Validate input (catches client-side typos)
    const validated = TeacherInputSchema.parse(teacherData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('staff', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = StaffSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'teachers', result.id);
      return result;
    }, 'TeacherService.create');
  }

  static async update(tenant: Tenant, id: string, teacherData: Partial<Staff>) {
    const validated = TeacherInputSchema.parse(teacherData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('staff', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = StaffSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'teachers', id);
      return result;
    }, 'TeacherService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('staff', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'teachers', id);
    }, 'TeacherService.delete');
  }
}

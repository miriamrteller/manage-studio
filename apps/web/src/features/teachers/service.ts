import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { StaffSchema, type Staff } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// What an admin types for a teacher. The login link (user_profile_id) is never
// sent: the database sets it when the teacher signs in with this email.
const TeacherInputSchema = z.object({
  name: z.string().trim().min(1, 'Teacher name required').optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
});

/** One of the signed-in teacher's own classes (get_my_teaching). */
export const MyTeachingClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  day_of_week: z.number().int().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  location: z.string().nullable(),
  status: z.string(),
  season_name: z.string().nullable(),
  teacher_name: z.string().nullable(),
  mine: z.boolean(),
  enrolled: z.number().int(),
});
export type MyTeachingClass = z.infer<typeof MyTeachingClassSchema>;

export const MyTeachingSchema = z.object({
  teacher_names: z.array(z.string()),
  own_classes_only: z.boolean(),
  classes: z.array(MyTeachingClassSchema),
});
export type MyTeaching = z.infer<typeof MyTeachingSchema>;

/** Blank email / phone are stored as null, not ''. */
export function toTeacherInput(values: { name?: string; email?: string | null; phone?: string | null }) {
  const blankToNull = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim());
  return TeacherInputSchema.parse({
    ...(values.name !== undefined ? { name: values.name } : {}),
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
  });
}

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
    const validated = toTeacherInput(teacherData);

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
    const validated = toTeacherInput(teacherData);

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
      // Their classes keep running, just without a teacher, so the row can go.
      const { error: unassignError } = await supabase
        .from('offerings')
        .update({ staff_id: null })
        .eq('tenant_id', tenant.id)
        .eq('staff_id', id);
      if (unassignError) throw unassignError;

      const { error } = await TenantDB.delete('staff', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'teachers', id);
    }, 'TeacherService.delete');
  }

  /** The signed-in teacher's own classes. */
  static async getMyTeaching(): Promise<MyTeaching> {
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('get_my_teaching');
      if (error) throw error;
      return MyTeachingSchema.parse(data ?? { teacher_names: [], own_classes_only: false, classes: [] });
    }, 'TeacherService.getMyTeaching');
  }
}

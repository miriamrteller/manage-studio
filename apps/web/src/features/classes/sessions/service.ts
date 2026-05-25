import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { ClassSessionSchema, TimeSchema, type ClassSession } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for session creation/update (without system fields)
const SessionInputSchema = z.object({
  class_id: z.string().uuid().optional(),
  session_date: z.string().date('Invalid date format').optional(),
  start_time: TimeSchema.optional(),
  end_time: TimeSchema.optional(),
});

/**
 * SessionService: All class session data operations
 * - Validates input/output with ClassSessionSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 * 
 * Note: Sessions are manually created/managed in V1.
 * Auto-generation via trigger comes in later phases.
 */
export class SessionService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number; classId?: string } = {}
  ) {
    const { page = 1, pageSize = 50, classId } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('class_sessions', tenant, {
        count: 'exact',
      });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      const { data, error, count } = await query
        .order('session_date', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        sessions: (data || []).map(s => ClassSessionSchema.parse(s)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'SessionService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('class_sessions', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Session not found');

      return ClassSessionSchema.parse(data);
    }, 'SessionService.get');
  }

  static async create(tenant: Tenant, sessionData: Partial<ClassSession>) {
    // Validate input (catches client-side typos)
    const validated = SessionInputSchema.parse(sessionData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('class_sessions', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = ClassSessionSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'class_sessions', result.id);
      return result;
    }, 'SessionService.create');
  }

  static async update(tenant: Tenant, id: string, sessionData: Partial<ClassSession>) {
    const validated = SessionInputSchema.parse(sessionData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('class_sessions', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = ClassSessionSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'class_sessions', id);
      return result;
    }, 'SessionService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('class_sessions', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'class_sessions', id);
    }, 'SessionService.delete');
  }
}

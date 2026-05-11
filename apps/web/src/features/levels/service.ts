import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { LevelSchema, type Level } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for level creation/update (without system fields)
const LevelInputSchema = z.object({
  name: z.string().min(1, 'Level name required').optional(),
  sort_order: z.number().int().nonnegative('Sort order must be >= 0').optional(),
});

/**
 * LevelService: All level (class level) data operations
 * - Validates input/output with LevelSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class LevelService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const { page = 1, pageSize = 50 } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const { data, error, count } = await TenantDB.selectFor('levels', tenant, {
        count: 'exact',
      })
        .order('sort_order', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        levels: (data || []).map(l => LevelSchema.parse(l)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'LevelService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('levels', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Level not found');

      return LevelSchema.parse(data);
    }, 'LevelService.get');
  }

  static async create(tenant: Tenant, levelData: Partial<Level>) {
    // Validate input (catches client-side typos)
    const validated = LevelInputSchema.parse(levelData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('levels', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = LevelSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'levels', result.id);
      return result;
    }, 'LevelService.create');
  }

  static async update(tenant: Tenant, id: string, levelData: Partial<Level>) {
    const validated = LevelInputSchema.parse(levelData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('levels', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = LevelSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'levels', id);
      return result;
    }, 'LevelService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('levels', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'levels', id);
    }, 'LevelService.delete');
  }
}

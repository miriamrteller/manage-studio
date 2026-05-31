import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import type { SortOrder } from '@/lib/list-query';
import { CategorySchema, type Category } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for level creation/update (without system fields)
const LevelInputSchema = z.object({
  name: z.string().min(1, 'Level name required').optional(),
  sort_order: z.number().int().nonnegative('Sort order must be >= 0').optional(),
});

export type CategorySortField = 'sort_order' | 'name' | 'created_at';

export const DEFAULT_LEVEL_SORT: { field: CategorySortField; order: SortOrder } = {
  field: 'sort_order',
  order: 'asc',
};

/**
 * LevelService: All level (class level) data operations
 * - Validates input/output with CategorySchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class LevelService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      searchQuery?: string;
      sortField?: CategorySortField;
      sortOrder?: SortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 50,
      searchQuery = '',
      sortField = DEFAULT_LEVEL_SORT.field,
      sortOrder = DEFAULT_LEVEL_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('categories', tenant, {
        count: 'exact',
      })
        .order(sortField, { ascending, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (sortField !== 'name') {
        query = query.order('name', { ascending: true });
      }

      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        levels: (data || []).map(l => CategorySchema.parse(l)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'LevelService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('categories', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Level not found');

      return CategorySchema.parse(data);
    }, 'LevelService.get');
  }

  static async create(tenant: Tenant, levelData: Partial<Category>) {
    // Validate input (catches client-side typos)
    const validated = LevelInputSchema.parse(levelData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('categories', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = CategorySchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'levels', result.id);
      return result;
    }, 'LevelService.create');
  }

  static async update(tenant: Tenant, id: string, levelData: Partial<Category>) {
    const validated = LevelInputSchema.parse(levelData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('categories', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = CategorySchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'levels', id);
      return result;
    }, 'LevelService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('categories', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'levels', id);
    }, 'LevelService.delete');
  }
}

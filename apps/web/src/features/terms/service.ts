import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import type { SortOrder } from '@/lib/list-query';
import { TermSchema, type Term } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for term creation/update (without system fields)
const TermInputSchema = z.object({
  name: z.string().min(1, 'Term name required').optional(),
  start_date: z.string().date('Invalid date format').optional(),
  end_date: z.string().date('Invalid date format').optional(),
  status: z.enum(['upcoming', 'active', 'completed', 'archived']).optional(),
});

export type TermSortField = 'name' | 'start_date' | 'end_date' | 'status';

export const DEFAULT_TERM_SORT: { field: TermSortField; order: SortOrder } = {
  field: 'start_date',
  order: 'desc',
};

/**
 * TermService: All term data operations
 * - Validates input/output with TermSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class TermService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      searchQuery?: string;
      status?: string;
      sortField?: TermSortField;
      sortOrder?: SortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 50,
      searchQuery = '',
      status,
      sortField = DEFAULT_TERM_SORT.field,
      sortOrder = DEFAULT_TERM_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('terms', tenant, {
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
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        terms: (data || []).map(t => TermSchema.parse(t)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'TermService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('terms', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Term not found');

      return TermSchema.parse(data);
    }, 'TermService.get');
  }

  static async create(tenant: Tenant, termData: Partial<Term>) {
    const validated = TermInputSchema.parse(termData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('terms', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = TermSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'terms', result.id);
      return result;
    }, 'TermService.create');
  }

  static async update(tenant: Tenant, id: string, termData: Partial<Term>) {
    const validated = TermInputSchema.parse(termData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('terms', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = TermSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'terms', id);
      return result;
    }, 'TermService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('terms', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'terms', id);
    }, 'TermService.delete');
  }
}

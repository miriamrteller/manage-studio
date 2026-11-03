import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import type { SortOrder } from '@/lib/list-query';
import { SeasonSchema, type Season } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for term creation/update (without system fields)
const TermInputSchema = z.object({
  name: z.string().min(1, 'Term name required').optional(),
  start_date: z.string().date('Invalid date format').optional(),
  end_date: z.string().date('Invalid date format').optional(),
  status: z.enum(['upcoming', 'active', 'completed', 'archived']).optional(),
});

/** End date of the "Ongoing" term: classes in it have no real end date. */
export const ONGOING_TERM_END_DATE = '2099-12-31';

export type SeasonSortField = 'name' | 'start_date' | 'end_date' | 'status';

export const DEFAULT_TERM_SORT: { field: SeasonSortField; order: SortOrder } = {
  field: 'start_date',
  order: 'desc',
};

/**
 * TermService: All term data operations
 * - Validates input/output with SeasonSchema
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
      statuses?: string[];
      sortField?: SeasonSortField;
      sortOrder?: SortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 50,
      searchQuery = '',
      status,
      statuses = [],
      sortField = DEFAULT_TERM_SORT.field,
      sortOrder = DEFAULT_TERM_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('seasons', tenant, {
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
      if (statuses.length > 0) {
        query = query.in('status', statuses);
      } else if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        terms: (data || []).map(t => SeasonSchema.parse(t)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'TermService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('seasons', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Term not found');

      return SeasonSchema.parse(data);
    }, 'TermService.get');
  }

  /**
   * The studio's "Ongoing" term (no real end date), for classes and plans that run until
   * they are cancelled, such as monthly plans. Reused when it exists; created otherwise,
   * active unless the studio already has an active term. Monthly billing never reads the
   * term, so the far-off end date only keeps the existing enrolment flow working.
   */
  static async ensureOngoing(tenant: Tenant, name: string): Promise<Season> {
    const { data: existing, error } = await TenantDB.selectFor('seasons', tenant)
      .eq('end_date', ONGOING_TERM_END_DATE)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (existing) return SeasonSchema.parse(existing);

    const { data: active } = await TenantDB.selectFor('seasons', tenant)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    return this.create(tenant, {
      name,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: ONGOING_TERM_END_DATE,
      status: active ? 'upcoming' : 'active',
    });
  }

  static async create(tenant: Tenant, termData: Partial<Season>) {
    const validated = TermInputSchema.parse(termData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('seasons', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = SeasonSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'terms', result.id);
      return result;
    }, 'TermService.create');
  }

  static async update(tenant: Tenant, id: string, termData: Partial<Season>) {
    const validated = TermInputSchema.parse(termData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('seasons', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = SeasonSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'terms', id);
      return result;
    }, 'TermService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('seasons', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'terms', id);
    }, 'TermService.delete');
  }
}

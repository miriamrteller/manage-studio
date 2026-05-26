import { TenantDB } from '@/lib/db';
import { BaseService } from '@/services/base.service';
import {
  ClassSchema,
  TimeSchema,
  type Class,
  type Tenant,
} from '@shared/schemas';
import { z } from 'zod';
import {
  DEFAULT_CLASS_SORT,
  type ClassSortField,
  type ClassSortOrder,
} from './utils/sortClasses';

// Validation schema for class creation/update (without system fields)
// Aligns with DB classes table — see Migration 004 + 004100 (teacher_id added)
const ClassInputSchema = z.object({
  term_id: z.string().uuid().optional(),
  level_id: z.string().uuid().nullable().optional(),
  teacher_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Class name required').optional(),
  max_capacity: z.number().positive('Max capacity must be > 0').optional(),
  min_age: z.number().int().nonnegative().nullable().optional(),
  max_age: z.number().int().nonnegative().nullable().optional(),
  price_minor: z.number().nonnegative('Price must be >= 0').optional(),
  currency: z.string().optional(),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  start_time: TimeSchema.optional(),
  end_time: TimeSchema.optional(),
  is_public: z.boolean().optional(),
  billing_frequency: z.string().optional(),
  status: z.enum(['active', 'cancelled', 'full']).optional(),
});

/**
 * ClassService: All class data operations
 * - Validates input/output with ClassSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class ClassService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      termIds?: string[];
      levelIds?: string[];
      statuses?: string[];
      searchQuery?: string;
      sortField?: ClassSortField;
      sortOrder?: ClassSortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 50,
      termIds = [],
      levelIds = [],
      statuses = [],
      searchQuery = '',
      sortField = DEFAULT_CLASS_SORT.field,
      sortOrder = DEFAULT_CLASS_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('classes', tenant, { count: 'exact' });

      if (termIds.length > 0) {
        query = query.in('term_id', termIds);
      }
      if (levelIds.length > 0) {
        query = query.in('level_id', levelIds);
      }
      if (statuses.length > 0) {
        query = query.in('status', statuses);
      }
      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      if (sortField === 'schedule') {
        query = query
          .order('day_of_week', { ascending, nullsFirst: false })
          .order('start_time', { ascending })
          .order('name', { ascending: true });
      } else {
        query = query.order(sortField, { ascending, nullsFirst: false });
        if (sortField !== 'name') {
          query = query.order('name', { ascending: true });
        }
      }

      const { data, error, count } = await query.range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        classes: (data || []).map(c => ClassSchema.parse(c)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'ClassService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('classes', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Class not found');

      return ClassSchema.parse(data);
    }, 'ClassService.get');
  }

  static async create(tenant: Tenant, classData: Partial<Class>) {
    // Validate input (catches client-side typos)
    const validated = ClassInputSchema.parse(classData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('classes', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = ClassSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'classes', result.id);
      return result;
    }, 'ClassService.create');
  }

  static async update(tenant: Tenant, id: string, classData: Partial<Class>) {
    const validated = ClassInputSchema.parse(classData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('classes', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = ClassSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'classes', id);
      return result;
    }, 'ClassService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('classes', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'classes', id);
    }, 'ClassService.delete');
  }
}

import { TenantDB } from '@/lib/db';
import { BaseService } from '@/services/base.service';
import {
  OfferingSchema,
  TimeSchema,
  type Offering,
  type Tenant,
} from '@shared/schemas';
import { z } from 'zod';
import {
  DEFAULT_CLASS_SORT,
  type OfferingSortField,
  type OfferingSortOrder,
} from './utils/sortClasses';
import { deleteOfferingCover, offeringCoverPath } from './lib/offeringImageStorage';

// Validation schema for class creation/update (without system fields)
// Aligns with DB classes table — see Migration 004 + 004100 (staff_id added)
const ClassInputSchema = z.object({
  season_id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().uuid().nullable().optional(),
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
  delivery_mode: z.enum(['scheduled', 'intangible']).optional(),
  billing_mode: z.enum(['one_time', 'recurring']).optional(),
  billing_interval: z.enum(['monthly', 'quarterly', 'annual']).nullable().optional(),
  status: z.enum(['active', 'cancelled', 'full']).optional(),
});

const CoverImagePathSchema = z.string().nullable();

/**
 * ClassService: All class data operations
 * - Validates input/output with OfferingSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class ClassService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      seasonIds?: string[];
      categoryIds?: string[];
      statuses?: string[];
      searchQuery?: string;
      sortField?: OfferingSortField;
      sortOrder?: OfferingSortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 50,
      seasonIds = [],
      categoryIds = [],
      statuses = [],
      searchQuery = '',
      sortField = DEFAULT_CLASS_SORT.field,
      sortOrder = DEFAULT_CLASS_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('offerings', tenant, { count: 'exact' });

      if (seasonIds.length > 0) {
        query = query.in('season_id', seasonIds);
      }
      if (categoryIds.length > 0) {
        query = query.in('category_id', categoryIds);
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
        classes: (data || []).flatMap((row) => {
          const parsed = OfferingSchema.safeParse(row);
          if (!parsed.success) {
            console.warn(
              '[ClassService.list] Skipping invalid offering:',
              (row as { id?: string })?.id,
              parsed.error.message,
            );
            return [];
          }
          return [parsed.data];
        }),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'ClassService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('offerings', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Class not found');

      return OfferingSchema.parse(data);
    }, 'ClassService.get');
  }

  static async create(tenant: Tenant, classData: Partial<Offering>) {
    // Validate input (catches client-side typos)
    const validated = ClassInputSchema.parse(classData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('offerings', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = OfferingSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'classes', result.id);
      return result;
    }, 'ClassService.create');
  }

  static async update(tenant: Tenant, id: string, classData: Partial<Offering>) {
    const validated = ClassInputSchema.parse(classData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('offerings', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = OfferingSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'classes', id);
      return result;
    }, 'ClassService.update');
  }

  static async setCoverImagePath(tenant: Tenant, id: string, path: string | null) {
    const validatedPath = CoverImagePathSchema.parse(path);
    if (validatedPath != null) {
      const expectedPath = offeringCoverPath(tenant.id, id);
      if (validatedPath !== expectedPath) {
        throw new Error('Invalid cover image path.');
      }
    }

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('offerings', tenant, id, {
        cover_image_path: validatedPath,
      })
        .select()
        .single();

      if (error) throw error;

      const result = OfferingSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'classes', id);
      return result;
    }, 'ClassService.setCoverImagePath');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const existing = await this.get(tenant, id);
      if (existing.cover_image_path) {
        try {
          await deleteOfferingCover(existing.cover_image_path);
        } catch (error) {
          console.warn('Failed to delete class cover image:', error);
        }
      }

      const { error } = await TenantDB.delete('offerings', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'classes', id);
    }, 'ClassService.delete');
  }
}

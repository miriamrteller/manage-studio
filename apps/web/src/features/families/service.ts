import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { FamilySchema, type Family } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for family creation/update (without system fields)
const FamilyInputSchema = z.object({
  name: z.string().min(1, 'Family name required').optional(),
});

/**
 * FamilyService: All family data operations
 * - Validates input/output with FamilySchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class FamilyService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const { page = 1, pageSize = 20 } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const { data, error, count } = await TenantDB.selectFor('families', tenant, {
        count: 'exact',
      })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        families: (data || []).map(f => FamilySchema.parse(f)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'FamilyService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('families', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Family not found');

      return FamilySchema.parse(data);
    }, 'FamilyService.get');
  }

  static async create(tenant: Tenant, familyData: Partial<Family>) {
    const validated = FamilyInputSchema.parse(familyData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('families', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = FamilySchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'families', result.id);
      return result;
    }, 'FamilyService.create');
  }

  static async update(tenant: Tenant, id: string, familyData: Partial<Family>) {
    const validated = FamilyInputSchema.parse(familyData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('families', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = FamilySchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'families', id);
      return result;
    }, 'FamilyService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('families', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'families', id);
    }, 'FamilyService.delete');
  }
}

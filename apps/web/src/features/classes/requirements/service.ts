import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { ClassRequirementSchema, type ClassRequirement } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for requirement creation/update (without system fields)
const RequirementInputSchema = z.object({
  class_id: z.string().uuid().optional(),
  requirement_type: z.enum(['min_age', 'prerequisite_class', 'admin_approval']).optional(),
  value: z.string().optional(),
  display_text: z.string().optional(),
  is_hard_block: z.boolean().optional(),
});

/**
 * RequirementService: All class requirement data operations
 * - Validates input/output with ClassRequirementSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class RequirementService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number; classId?: string } = {}
  ) {
    const { page = 1, pageSize = 50, classId } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('class_requirements', tenant, {
        count: 'exact',
      });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        requirements: (data || []).map(r => ClassRequirementSchema.parse(r)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'RequirementService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('class_requirements', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Requirement not found');

      return ClassRequirementSchema.parse(data);
    }, 'RequirementService.get');
  }

  static async create(tenant: Tenant, requirementData: Partial<ClassRequirement>) {
    // Validate input (catches client-side typos)
    const validated = RequirementInputSchema.parse(requirementData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('class_requirements', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = ClassRequirementSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'class_requirements', result.id);
      return result;
    }, 'RequirementService.create');
  }

  static async update(tenant: Tenant, id: string, requirementData: Partial<ClassRequirement>) {
    const validated = RequirementInputSchema.parse(requirementData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('class_requirements', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = ClassRequirementSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'class_requirements', id);
      return result;
    }, 'RequirementService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('class_requirements', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'class_requirements', id);
    }, 'RequirementService.delete');
  }
}

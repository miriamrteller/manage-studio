import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
  ClassRequirementSchema,
  RequirementTemplateSchema,
  type ClassRequirement,
  type RequirementTemplate,
  type Tenant,
} from '@shared/schemas';
import { z } from 'zod';

// ── Requirement Templates ─────────────────────────────────────────────────────

const TemplateInputSchema = z.object({
  name: z.string().min(1),
  requirement_type: z.string().min(1),
  config: z.record(z.unknown()),
  display_text: z.string().optional(),
  is_hard_block: z.boolean().optional(),
});

export class RequirementTemplateService extends BaseService {
  static async list(tenant: Tenant): Promise<RequirementTemplate[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('requirement_templates', tenant)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(r => RequirementTemplateSchema.parse(r));
    }, 'RequirementTemplateService.list');
  }

  static async create(tenant: Tenant, input: Partial<RequirementTemplate>) {
    const validated = TemplateInputSchema.parse(input);
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('requirement_templates', tenant, validated)
        .select()
        .single();
      if (error) throw error;
      const result = RequirementTemplateSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'requirement_templates', result.id);
      return result;
    }, 'RequirementTemplateService.create');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('requirement_templates', tenant, id);
      if (error) throw error;
      await this.logAudit(tenant, 'DELETE', 'requirement_templates', id);
    }, 'RequirementTemplateService.delete');
  }
}

// ── Class Requirements (link rows) ────────────────────────────────────────────

// Schema for the joined query result (class_requirements + requirement_templates)
export const ClassRequirementWithTemplateSchema = ClassRequirementSchema.extend({
  requirement_templates: RequirementTemplateSchema.nullable().optional(),
});
export type ClassRequirementWithTemplate = z.infer<typeof ClassRequirementWithTemplateSchema>;

export class RequirementService extends BaseService {
  /** Fetch all requirements for a class, joined with their template details. */
  static async list(tenant: Tenant, classId: string): Promise<ClassRequirementWithTemplate[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('class_requirements')
        .select('*, requirement_templates(*)')
        .eq('tenant_id', tenant.id)
        .eq('class_id', classId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []).map(r => ClassRequirementWithTemplateSchema.parse(r));
    }, 'RequirementService.list');
  }

  /** Link a template to a class. */
  static async linkTemplate(tenant: Tenant, classId: string, templateId: string): Promise<ClassRequirement> {
    return this.withRetry(async () => {
      const payload = { class_id: classId, requirement_template_id: templateId };
      const { data, error } = await TenantDB.insert('class_requirements', tenant, payload)
        .select()
        .single();
      if (error) throw error;
      const result = ClassRequirementSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'class_requirements', result.id);
      return result;
    }, 'RequirementService.linkTemplate');
  }

  /** Remove a requirement link from a class. */
  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('class_requirements', tenant, id);
      if (error) throw error;
      await this.logAudit(tenant, 'DELETE', 'class_requirements', id);
    }, 'RequirementService.delete');
  }
}

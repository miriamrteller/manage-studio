import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { ConsentTemplateSchema, WaiverEvidenceSchema, type ConsentTemplate, type WaiverEvidence } from '@shared/schemas';
import type { Tenant } from '@shared/schemas';

export interface WaiverEvidenceFilters {
  studentName?: string;
  signerEmail?: string;
  offeringId?: string;
  seasonId?: string;
}

export class WaiverService extends BaseService {
  /** List all consent templates for the tenant ordered by version descending. */
  static async listTemplates(tenant: Tenant): Promise<ConsentTemplate[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('consent_templates', tenant)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => ConsentTemplateSchema.parse(row));
    }, 'WaiverService.listTemplates');
  }

  /** Create a new draft template. version_hash is sha256hex(content) — computed client-side. */
  static async createDraft(
    tenant: Tenant,
    input: { name: string; content: string; version_hash: string },
  ): Promise<ConsentTemplate> {
    return this.withRetry(async () => {
      const { data: existing } = await TenantDB.selectFor('consent_templates', tenant)
        .select('version')
        .eq('name', input.name)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = existing ? (existing.version as number) + 1 : 1;

      const { data, error } = await TenantDB.insert('consent_templates', tenant, {
        name: input.name,
        content: input.content,
        version: nextVersion,
        version_hash: input.version_hash,
        status: 'draft',
      })
        .select()
        .single();
      if (error) throw error;
      const result = ConsentTemplateSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'consent_templates', result.id);
      return result;
    }, 'WaiverService.createDraft');
  }

  /** Promote a draft → approved. */
  static async approveTemplate(tenant: Tenant, id: string): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await TenantDB.update('consent_templates', tenant, id, {
        status: 'approved',
      });
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'consent_templates', id);
    }, 'WaiverService.approveTemplate');
  }

  /**
   * Promote an approved/draft template → active.
   * Archives the current active template first.
   * NOTE: waiver_evidence rows are immutable; re-sign is triggered automatically
   * because useWaiverStatus checks the new template version.
   */
  static async activateTemplate(tenant: Tenant, draftId: string): Promise<void> {
    return this.withRetry(async () => {
      // 1. Archive current active (if any) — prevents two active rows
      const { data: currentActive } = await TenantDB.selectFor('consent_templates', tenant)
        .select('id')
        .eq('status', 'active')
        .maybeSingle();
      if (currentActive) {
        const { error: archiveError } = await TenantDB.update(
          'consent_templates',
          tenant,
          currentActive.id as string,
          { status: 'archived' },
        );
        if (archiveError) throw archiveError;
      }
      // 2. Promote to active
      const { error } = await TenantDB.update('consent_templates', tenant, draftId, {
        status: 'active',
      });
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'consent_templates', draftId);
    }, 'WaiverService.activateTemplate');
  }

  /** Archive a draft or approved template. */
  static async archiveTemplate(tenant: Tenant, id: string): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await TenantDB.update('consent_templates', tenant, id, {
        status: 'archived',
      });
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'consent_templates', id);
    }, 'WaiverService.archiveTemplate');
  }

  /** List signed waiver evidence (admin only), enriched with student + class names. */
  static async listEvidence(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } & WaiverEvidenceFilters = {},
  ): Promise<{ evidence: WaiverEvidence[]; total: number }> {
    const { page = 1, pageSize = 50, studentName, signerEmail, offeringId, seasonId } = options;
    const from = (page - 1) * pageSize;
    return this.withRetry(async () => {
      // Pre-resolve student name → matching person IDs (people table has no anon grant,
      // but admins have authenticated access).
      let personIds: string[] | null = null;
      if (studentName?.trim()) {
        const { data: persons } = await supabase
          .from('people')
          .select('id')
          .eq('tenant_id', tenant.id)
          .ilike('name', `%${studentName.trim()}%`);
        personIds = (persons ?? []).map((p) => p.id as string);
        if (personIds.length === 0) return { evidence: [], total: 0 };
      }

      // Pre-resolve season → matching offering IDs (only when offeringId not set directly).
      let seasonOfferingIds: string[] | null = null;
      if (seasonId && !offeringId) {
        const { data: offs } = await supabase
          .from('offerings')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('season_id', seasonId);
        seasonOfferingIds = (offs ?? []).map((o) => o.id as string);
        if (seasonOfferingIds.length === 0) return { evidence: [], total: 0 };
      }

      // Build query with relational joins for display columns.
      let q = supabase
        .from('waiver_evidence')
        .select('*, people!person_id(name), offerings!offering_id(name)', { count: 'exact' })
        .eq('tenant_id', tenant.id);

      if (personIds)          q = q.in('person_id', personIds);
      if (signerEmail?.trim()) q = q.ilike('signed_by_email', `%${signerEmail.trim()}%`);
      if (offeringId)          q = q.eq('offering_id', offeringId);
      else if (seasonOfferingIds) q = q.in('offering_id', seasonOfferingIds);

      const { data, error, count } = await q
        .order('signed_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      return {
        evidence: (data || []).map((row) => WaiverEvidenceSchema.parse(row)),
        total: count || 0,
      };
    }, 'WaiverService.listEvidence');
  }
}

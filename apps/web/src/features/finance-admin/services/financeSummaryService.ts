import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import { FinanceSummarySchema, type FinanceSummary } from '@shared/schemas';
import type { Tenant } from '@shared/schemas';

export interface OutstandingEngagementRow {
  id: string;
  person_id: string | null;
  offering_id: string | null;
  status: string;
  person: { id: string; name: string } | null;
  offering: { id: string; name: string } | null;
}

export class FinanceSummaryService extends BaseService {
  static async getSummary(
    tenant: Tenant,
    startDate: string,
    endDate: string,
  ): Promise<FinanceSummary> {
    return this.withRetry(async () => {
      if (!tenant?.id) throw new Error('Tenant ID required');

      const { data, error } = await supabase.rpc('get_finance_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return FinanceSummarySchema.parse({
          net_revenue_minor: 0,
          payment_count: 0,
          outstanding_engagements: 0,
          failed_payments_7d: 0,
          net_expenses_minor: 0,
        });
      }
      return FinanceSummarySchema.parse(row);
    }, 'FinanceSummaryService.getSummary');
  }

  static async getActiveSeasonId(tenant: Tenant): Promise<string | null> {
    const { data, error } = await supabase
      .from('seasons')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    return data?.id ?? null;
  }

  static async listOutstandingEngagements(
    tenant: Tenant,
    seasonId: string | null,
    limit = 10,
  ): Promise<OutstandingEngagementRow[]> {
    if (!seasonId) return [];

    const { data, error } = await supabase
      .from('engagements')
      .select(
        `
        id, person_id, offering_id, status,
        person:people!engagements_person_id_fkey(id, name),
        offering:offerings!engagements_offering_id_fkey(id, name)
      `,
      )
      .eq('tenant_id', tenant.id)
      .eq('status', 'pending_payment')
      .eq('season_id', seasonId)
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      person_id: row.person_id as string | null,
      offering_id: row.offering_id as string | null,
      status: String(row.status),
      person: normalizeRelation(row.person as unknown),
      offering: normalizeRelation(row.offering as unknown),
    }));
  }
}

function normalizeRelation(value: unknown): { id: string; name: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (!first || typeof first !== 'object') return null;
    return {
      id: String((first as { id: unknown }).id),
      name: String((first as { name: unknown }).name),
    };
  }
  if (typeof value === 'object') {
    return {
      id: String((value as { id: unknown }).id),
      name: String((value as { name: unknown }).name),
    };
  }
  return null;
}

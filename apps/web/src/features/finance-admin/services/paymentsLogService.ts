import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import { PaymentLogRowSchema } from '@shared/schemas';
import type { Tenant } from '@shared/schemas';
import type { PaymentCaptureSource } from '../lib/paymentsLogDisplay';

export const PAYMENTS_LOG_PAGE_SIZE = 50;

export interface PaymentsLogFilters {
  statuses?: string[];
  chargeTypes?: string[];
  captureSources?: PaymentCaptureSource[];
  dateFrom?: string | null;
  dateTo?: string | null;
  personIds?: string[];
}

export class PaymentsLogService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      filters?: PaymentsLogFilters;
      /** Accountant export: oldest paid first, plus the payer's business details. */
      forExport?: boolean;
    } = {},
  ) {
    const { page = 1, pageSize = PAYMENTS_LOG_PAGE_SIZE, filters = {}, forExport = false } = options;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    return this.withRetry(async () => {
      if (!tenant?.id) throw new Error('Tenant ID required');

      let query = supabase
        .from('payments')
        .select(
          `
          id, person_id, account_id, offering_id, engagement_id,
          pretax_amount_minor, vat_amount_minor, total_amount_minor, currency,
          status, charge_type, provider, payment_method,
          paid_at, created_at, external_document_number, invoice_url,
          external_document_id, issued_document_kind, invoice_issued_at, allocation_number, refunds_payment_id,
          document_queue(status, document_kind, created_at),
          person:people!payments_person_id_fkey(id, name),
          offering:offerings!payments_offering_id_fkey(id, name),
          engagement:engagements!payments_engagement_id_fkey(id, status)${
            forExport
              ? ', billing_account:billing_accounts!payments_billing_account_id_fkey(business_name, business_tax_id)'
              : ''
          }
        `,
          { count: 'exact' },
        )
        .eq('tenant_id', tenant.id);

      // A unique tie-breaker (id) keeps pages stable while an export pages through.
      query = forExport
        ? query.order('paid_at', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
        : query.order('created_at', { ascending: false }).order('id', { ascending: false });
      query = query.range(from, to);

      if (filters.statuses?.length) {
        query = query.in('status', filters.statuses);
      }
      if (filters.chargeTypes?.length) {
        query = query.in('charge_type', filters.chargeTypes);
      }
      if (filters.captureSources?.length === 1) {
        if (filters.captureSources[0] === 'manual') {
          query = query.eq('provider', 'manual');
        } else {
          query = query.neq('provider', 'manual');
        }
      }
      if (filters.dateFrom) {
        query = query.gte('paid_at', `${filters.dateFrom}T00:00:00`);
      }
      if (filters.dateTo) {
        query = query.lte('paid_at', `${filters.dateTo}T23:59:59.999`);
      }
      if (filters.personIds?.length) {
        query = query.in('person_id', filters.personIds);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((row) => PaymentLogRowSchema.parse(row));

      return {
        rows,
        totalCount: count ?? 0,
        page,
        pageSize,
      };
    }, 'PaymentsLogService.list');
  }

  /** Document numbers of original payments, for "refund of" in the accountant export. */
  static async documentNumbersByPaymentIds(
    tenant: Tenant,
    ids: string[],
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await supabase
        .from('payments')
        .select('id, external_document_number')
        .eq('tenant_id', tenant.id)
        .in('id', chunk);
      if (error) throw error;
      for (const row of data ?? []) {
        result.set(row.id as string, (row.external_document_number as string | null) ?? null);
      }
    }
    return result;
  }

  static async searchPayerPersonIds(tenant: Tenant, search: string): Promise<string[]> {
    const trimmed = search.trim();
    if (!trimmed) return [];

    const { data, error } = await supabase
      .from('people')
      .select('id')
      .eq('tenant_id', tenant.id)
      .ilike('name', `%${trimmed}%`)
      .limit(100);

    if (error) throw error;
    return (data ?? []).map((row) => row.id as string);
  }
}

export const PROVIDER_I18N_KEYS: Record<string, string> = {
  manual: 'finance.provider.manual',
  mock: 'finance.provider.mock',
  grow: 'finance.provider.grow',
  stripe: 'finance.provider.stripe',
};

export function getProviderLabelKey(provider: string): string {
  return PROVIDER_I18N_KEYS[provider] ?? provider;
}

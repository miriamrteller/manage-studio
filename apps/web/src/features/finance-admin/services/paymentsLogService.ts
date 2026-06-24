import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import { PaymentLogRowSchema } from '@shared/schemas';
import type { Tenant } from '@shared/schemas';

export const PAYMENTS_LOG_PAGE_SIZE = 50;

export interface PaymentsLogFilters {
  statuses?: string[];
  chargeTypes?: string[];
  providers?: string[];
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
    } = {},
  ) {
    const { page = 1, pageSize = PAYMENTS_LOG_PAGE_SIZE, filters = {} } = options;
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
          person:people!payments_person_id_fkey(id, name),
          offering:offerings!payments_offering_id_fkey(id, name),
          engagement:engagements!payments_engagement_id_fkey(id, status)
        `,
          { count: 'exact' },
        )
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filters.statuses?.length) {
        query = query.in('status', filters.statuses);
      }
      if (filters.chargeTypes?.length) {
        query = query.in('charge_type', filters.chargeTypes);
      }
      if (filters.providers?.length) {
        query = query.in('provider', filters.providers);
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

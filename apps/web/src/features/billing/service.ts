import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import type { SortOrder } from '@/lib/list-query';
import { BillingAccountUpdateSchema, type BillingAccountUpdate, type Tenant } from '@shared/schemas';
import {
  BILLING_ACCOUNT_SEARCH_SELECT,
  BILLING_ACCOUNT_SELECT,
  payerSearchFilter,
  pickSavedCard,
  toBillingAccountView,
} from './lib/billingAccountView';

/** Only real columns can be sorted on. */
export type BillingSortField = 'created_at' | 'status';

export const DEFAULT_BILLING_SORT: { field: BillingSortField; order: SortOrder } = {
  field: 'created_at',
  order: 'desc',
};

/**
 * BillingAccountService: billing accounts as stored in billing_accounts.
 * Accounts are created automatically for the payer when a student enrols
 * (ensureBillingAccountForStudent / enrolment RPCs), so there is no create here, and no
 * delete (payments and enrolments reference them); archive instead.
 */
export class BillingAccountService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      searchQuery?: string;
      statuses?: string[];
      sortField?: BillingSortField;
      sortOrder?: SortOrder;
    } = {},
  ) {
    const {
      page = 1,
      pageSize = 20,
      searchQuery = '',
      statuses = [],
      sortField = DEFAULT_BILLING_SORT.field,
      sortOrder = DEFAULT_BILLING_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const search = payerSearchFilter(searchQuery);

    return this.withRetry(async () => {
      let query = supabase
        .from('billing_accounts')
        .select(search ? BILLING_ACCOUNT_SEARCH_SELECT : BILLING_ACCOUNT_SELECT, { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .order(sortField, { ascending: sortOrder === 'asc', nullsFirst: false });
      if (sortField !== 'created_at') {
        query = query.order('created_at', { ascending: false });
      }
      if (search) {
        query = query.or(search, { referencedTable: 'payer' });
      }
      if (statuses.length > 0) {
        query = query.in('status', statuses);
      }

      const { data, error, count } = await query.range(from, from + pageSize - 1);
      if (error) throw error;

      return {
        accounts: (data || []).map((row: unknown) => toBillingAccountView(row)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'BillingAccountService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('billing_accounts')
        .select(BILLING_ACCOUNT_SELECT)
        .eq('tenant_id', tenant.id)
        .eq('id', id)
        .single();
      if (error) throw error;
      if (!data) throw new Error('Billing account not found');

      const account = toBillingAccountView(data);
      // Card studios: the saved card used for monthly charges. Pay-at-the-studio: none.
      const { data: cards } = await supabase.rpc('get_billing_account_payment_method', {
        p_billing_account_id: id,
      });
      return { ...account, savedCard: pickSavedCard(cards) };
    }, 'BillingAccountService.get');
  }

  static async update(tenant: Tenant, id: string, changes: BillingAccountUpdate) {
    const validated = BillingAccountUpdateSchema.parse(changes);

    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('billing_accounts')
        .update(validated)
        .eq('tenant_id', tenant.id)
        .eq('id', id)
        .select(BILLING_ACCOUNT_SELECT)
        .single();
      if (error) throw error;

      const result = toBillingAccountView(data);
      await this.logAudit(tenant, 'UPDATE', 'billing_accounts', id);
      return result;
    }, 'BillingAccountService.update');
  }
}

import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import type { SortOrder } from '@/lib/list-query';
import {
  BillingAccountSchema,
  BillingAccountCreateSchema,
  type BillingAccountCreate,
} from '@shared/schemas';
import type { Tenant } from '@shared/schemas';

export type BillingSortField = 'account_holder_name' | 'created_at' | 'status';

export const DEFAULT_BILLING_SORT: { field: BillingSortField; order: SortOrder } = {
  field: 'created_at',
  order: 'desc',
};

/**
 * BillingAccountService: All billing account data operations
 * - Validates input/output with BillingAccountSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class BillingAccountService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      searchQuery?: string;
      paymentMethod?: string;
      status?: string;
      sortField?: BillingSortField;
      sortOrder?: SortOrder;
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 20,
      searchQuery = '',
      paymentMethod,
      status,
      sortField = DEFAULT_BILLING_SORT.field,
      sortOrder = DEFAULT_BILLING_SORT.order,
    } = options;
    const from = (page - 1) * pageSize;
    const ascending = sortOrder === 'asc';

    return this.withRetry(async () => {
      let query = TenantDB.selectFor(
        'billing_accounts',
        tenant,
        { count: 'exact' }
      )
        .order(sortField, { ascending, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (sortField !== 'account_holder_name') {
        query = query.order('account_holder_name', { ascending: true });
      }

      if (searchQuery.trim()) {
        const q = `%${searchQuery.trim()}%`;
        query = query.or(
          `account_holder_name.ilike.${q},primary_contact_email.ilike.${q}`
        );
      }
      if (paymentMethod) {
        query = query.eq('payment_method', paymentMethod);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        accounts: (data || []).map((a: unknown) =>
          BillingAccountSchema.parse(a)
        ),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'BillingAccountService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor(
        'billing_accounts',
        tenant
      )
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Billing account not found');

      return BillingAccountSchema.parse(data);
    }, 'BillingAccountService.get');
  }

  static async create(
    tenant: Tenant,
    accountData: BillingAccountCreate
  ) {
    const validated = BillingAccountCreateSchema.parse(accountData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert(
        'billing_accounts',
        tenant,
        validated
      )
        .select()
        .single();

      if (error) throw error;

      const result = BillingAccountSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'billing_accounts', result.id);
      return result;
    }, 'BillingAccountService.create');
  }

  static async update(
    tenant: Tenant,
    id: string,
    accountData: Partial<BillingAccountCreate>
  ) {
    // Validate partial schema
    const validated = BillingAccountCreateSchema.partial().parse(accountData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update(
        'billing_accounts',
        tenant,
        id,
        validated
      )
        .select()
        .single();

      if (error) throw error;

      const result = BillingAccountSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'billing_accounts', id);
      return result;
    }, 'BillingAccountService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('billing_accounts', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'billing_accounts', id);
    }, 'BillingAccountService.delete');
  }
}

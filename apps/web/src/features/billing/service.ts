import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import {
  BillingAccountSchema,
  BillingAccountCreateSchema,
  type BillingAccountCreate,
} from '@shared/schemas';
import type { Tenant } from '@shared/schemas';

/**
 * BillingAccountService: All billing account data operations
 * - Validates input/output with BillingAccountSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 */
export class BillingAccountService extends BaseService {
  static async list(
    tenant: Tenant,
    options: { page?: number; pageSize?: number } = {}
  ) {
    const { page = 1, pageSize = 20 } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      const { data, error, count } = await TenantDB.selectFor(
        'billing_accounts',
        tenant,
        { count: 'exact' }
      )
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

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

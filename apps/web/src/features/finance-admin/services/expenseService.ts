import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
  ExpenseCategorySchema,
  ExpenseSchema,
  type ExpenseCategory,
  type ExpenseCreateInput,
} from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';
import { receiptStoragePath } from '../lib/financeAdminUtils';
import type { SupplierExpenseRow } from '../lib/expenseSuppliers';
import type { ExpenseCatalogItem, ExpenseCatalogNames } from '../lib/expenseCategoryName';

export const EXPENSES_PAGE_SIZE = 50;
export const RECEIPT_BUCKET = 'expense-receipts';
export const RECEIPT_MAX_BYTES = 5242880;

const ExpenseCategoryInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).nullable().optional(),
  is_vat_eligible: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  catalog_key: z.string().nullable().optional(),
});

const CATEGORY_COLUMNS = '*, catalog:expense_category_catalog(name_en, name_he)';

export interface ExpensesListFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  categoryIds?: string[];
}

export class ExpenseService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      filters?: ExpensesListFilters;
    } = {},
  ) {
    const { page = 1, pageSize = EXPENSES_PAGE_SIZE, filters = {} } = options;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    return this.withRetry(async () => {
      let query = supabase
        .from('expenses')
        .select(
          `
          *,
          category:expense_categories!expenses_category_id_fkey(id, name, catalog:expense_category_catalog(name_en, name_he))
        `,
          { count: 'exact' },
        )
        .eq('tenant_id', tenant.id)
        .order('expense_date', { ascending: false })
        // Unique tie-breaker so export pages don't skip or repeat rows.
        .order('id', { ascending: false })
        .range(from, to);

      if (filters.dateFrom) {
        query = query.gte('expense_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('expense_date', filters.dateTo);
      }
      if (filters.categoryIds?.length) {
        query = query.in('category_id', filters.categoryIds);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((row) => ({
        ...ExpenseSchema.parse(row),
        category: row.category as { id: string; name: string; catalog?: ExpenseCatalogNames | null } | null,
      }));

      return {
        rows,
        totalCount: count ?? 0,
        page,
        pageSize,
      };
    }, 'ExpenseService.list');
  }

  /** Supplier name + VAT number of the studio's latest expenses (newest first), for prefill. */
  static async supplierHistory(tenant: Tenant): Promise<SupplierExpenseRow[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('supplier_name, supplier_vat_number')
        .eq('tenant_id', tenant.id)
        .not('supplier_name', 'is', null)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SupplierExpenseRow[];
    }, 'ExpenseService.supplierHistory');
  }

  static async createExpense(
    tenant: Tenant,
    input: Omit<ExpenseCreateInput, 'p_currency'>,
    receiptPath?: string | null,
  ): Promise<string> {
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('create_expense', {
        p_expense_id: input.p_expense_id,
        p_category_id: input.p_category_id,
        p_description: input.p_description,
        p_pretax_amount_minor: input.p_pretax_amount_minor,
        p_vat_amount_minor: input.p_vat_amount_minor,
        p_total_amount_minor: input.p_total_amount_minor,
        p_currency: tenant.currency,
        p_supplier_name: input.p_supplier_name ?? null,
        p_supplier_vat_number: input.p_supplier_vat_number ?? null,
        p_receipt_storage_path: receiptPath ?? input.p_receipt_storage_path ?? null,
        p_expense_date: input.p_expense_date,
        p_corrects_expense_id: input.p_corrects_expense_id ?? null,
      });

      if (error) throw error;
      return data as string;
    }, 'ExpenseService.createExpense');
  }

  static async uploadReceipt(
    tenantId: string,
    expenseId: string,
    file: File,
  ): Promise<string> {
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new Error('Receipt file exceeds 5 MB limit');
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop()! : 'bin';
    const path = receiptStoragePath(tenantId, expenseId, ext);

    const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (error) throw error;
    return path;
  }

  static async removeReceipt(path: string): Promise<void> {
    const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
    if (error) throw error;
  }
}

export class ExpenseCategoryService extends BaseService {
  static async list(tenant: Tenant) {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select(CATEGORY_COLUMNS)
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => ExpenseCategorySchema.parse(row));
    }, 'ExpenseCategoryService.list');
  }

  static async create(tenant: Tenant, input: Partial<ExpenseCategory>) {
    return this.withRetry(async () => {
      const parsed = ExpenseCategoryInputSchema.parse(input);
      const { data, error } = await TenantDB.insert('expense_categories', tenant, parsed)
        .select(CATEGORY_COLUMNS)
        .single();
      if (error) throw error;
      await this.logAudit(tenant, 'CREATE', 'expense_categories', data.id);
      return ExpenseCategorySchema.parse(data);
    }, 'ExpenseCategoryService.create');
  }

  static async update(tenant: Tenant, id: string, input: Partial<ExpenseCategory>) {
    return this.withRetry(async () => {
      const parsed = ExpenseCategoryInputSchema.partial().parse(input);
      const { data, error } = await TenantDB.update('expense_categories', tenant, id, parsed)
        .select(CATEGORY_COLUMNS)
        .single();
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'expense_categories', id);
      return ExpenseCategorySchema.parse(data);
    }, 'ExpenseCategoryService.update');
  }

  /**
   * Switch a common category on or off for the studio. On: the studio's row for it is
   * switched back on, or a same-named row of its own becomes it, or a new row is added
   * (Hebrew name stored, shown in the reader's language). Off: the row is switched off;
   * expenses already filed under it keep it.
   */
  static async setCatalogEnabled(
    tenant: Tenant,
    item: ExpenseCatalogItem,
    on: boolean,
    current: ExpenseCategory[],
  ) {
    const own = current.find((c) => c.catalog_key === item.key);
    if (own) return this.update(tenant, own.id, { is_active: on });
    if (!on) return null;
    const sameName = current.find(
      (c) => !c.catalog_key && [item.name_he, item.name_en].some((n) => n.trim().toLowerCase() === c.name.trim().toLowerCase()),
    );
    if (sameName) return this.update(tenant, sameName.id, { catalog_key: item.key, is_active: true });
    return this.create(tenant, {
      name: item.name_he,
      catalog_key: item.key,
      is_vat_eligible: item.is_vat_eligible,
      is_active: true,
      sort_order: item.sort_order,
    });
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('expense_categories', tenant, id);
      if (error) throw error;
      await this.logAudit(tenant, 'DELETE', 'expense_categories', id);
    }, 'ExpenseCategoryService.delete');
  }
}

/** The common categories, and which ones each skin starts with. */
export class ExpenseCatalogService extends BaseService {
  static async catalog(): Promise<ExpenseCatalogItem[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('expense_category_catalog')
        .select('key, name_en, name_he, is_vat_eligible, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExpenseCatalogItem[];
    }, 'ExpenseCatalogService.catalog');
  }

  /** The skin's list and the generic one (the fallback for a skin without its own). */
  static async skinSets(skin: string | null | undefined): Promise<{ skin: string[] | null; generic: string[] | null }> {
    return this.withRetry(async () => {
      const ids = [...new Set([skin ?? 'generic', 'generic'])];
      const { data, error } = await supabase.from('verticals').select('id, expense_categories').in('id', ids);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; expense_categories: string[] | null }[];
      return {
        skin: rows.find((r) => r.id === (skin ?? 'generic'))?.expense_categories ?? null,
        generic: rows.find((r) => r.id === 'generic')?.expense_categories ?? null,
      };
    }, 'ExpenseCatalogService.skinSets');
  }
}

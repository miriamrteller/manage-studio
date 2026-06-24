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
});

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
          category:expense_categories!expenses_category_id_fkey(id, name)
        `,
          { count: 'exact' },
        )
        .eq('tenant_id', tenant.id)
        .order('expense_date', { ascending: false })
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
        category: row.category as { id: string; name: string } | null,
      }));

      return {
        rows,
        totalCount: count ?? 0,
        page,
        pageSize,
      };
    }, 'ExpenseService.list');
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
      const { data, error } = await TenantDB.selectFor('expense_categories', tenant)
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
        .select()
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
        .select()
        .single();
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'expense_categories', id);
      return ExpenseCategorySchema.parse(data);
    }, 'ExpenseCategoryService.update');
  }

  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('expense_categories', tenant, id);
      if (error) throw error;
      await this.logAudit(tenant, 'DELETE', 'expense_categories', id);
    }, 'ExpenseCategoryService.delete');
  }
}

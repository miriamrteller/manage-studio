import { supabase } from '@/lib/supabase';
import type { Json } from '@shared/database.types';
import type { ImportRow } from './importRows';

export interface ImportResult {
  batch_id: string;
  income: number;
  expenses: number;
  receipts_matched: number;
  skipped: number;
  new_categories: number;
}

export interface ImportBatch {
  id: string;
  file_name: string;
  sheet_name: string | null;
  file_fingerprint: string | null;
  income_count: number;
  expense_count: number;
  receipts_matched_count: number;
  skipped_count: number;
  created_at: string;
  undone_at: string | null;
}

/** Imports and undoes studio spreadsheets (import_finance_rows / undo_finance_import). */
export const FinanceImportService = {
  async importRows(args: {
    fileName: string;
    sheetName: string | null;
    fileFingerprint: string;
    mapping: Record<string, string>;
    rows: ImportRow[];
  }): Promise<ImportResult> {
    // One call, one transaction: never retried (a retry could double-count a timed-out import
    // if the fingerprints changed; they don't, but one clear failure is easier to read).
    const { data, error } = await supabase.rpc('import_finance_rows', {
      p_file_name: args.fileName,
      p_sheet_name: args.sheetName ?? '',
      p_file_fingerprint: args.fileFingerprint,
      p_mapping: args.mapping as Json,
      p_rows: args.rows as unknown as Json,
    });
    if (error) throw error;
    return data as unknown as ImportResult;
  },

  async undo(batchId: string): Promise<void> {
    const { error } = await supabase.rpc('undo_finance_import', { p_batch_id: batchId });
    if (error) throw error;
  },

  async listBatches(tenantId: string): Promise<ImportBatch[]> {
    const { data, error } = await supabase
      .from('finance_import_batches')
      .select(
        'id, file_name, sheet_name, file_fingerprint, income_count, expense_count, receipts_matched_count, skipped_count, created_at, undone_at',
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as ImportBatch[];
  },
};

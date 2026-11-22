import { supabase } from '@/lib/supabase';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { normalise } from './importRows';

/**
 * Finance -> Import -> "Send receipt": imported income rows that can still get a receipt.
 * Pure helpers mirror supabase/functions/_shared/payments/imported-receipt.ts (a test checks
 * the method mapping agrees).
 */

export type OfflineMethod = 'cash' | 'bank_transfer' | 'bit';
export const OFFLINE_METHODS: readonly OfflineMethod[] = ['cash', 'bank_transfer', 'bit'];

/** Mirrors MAX_RECEIPTS_PER_REQUEST in the edge function. */
export const RECEIPTS_PER_REQUEST = 50;

export interface ImportedIncome {
  id: string;
  income_date: string;
  amount_minor: number;
  payer_name: string | null;
  payer_email: string | null;
  payment_method: string | null;
  job_name: string | null;
  receipt_book: string | null;
  receipt_number: string | null;
  payment_id: string | null;
  payment: { external_document_number: string | null; invoice_url: string | null } | null;
}

export interface ClientContact {
  id: string;
  name: string;
  email: string | null;
}

/** Pure: the sheet's method text as one of ours, or null when it can't be told. */
export function offlineMethodFromSheet(value: string | null | undefined): OfflineMethod | null {
  const v = String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return null;
  if (/\b(bit|paybox|pay box)\b|ביט|פייבוקס/.test(v)) return 'bit';
  if (/\bcash\b|מזומן/.test(v)) return 'cash';
  if (/\b(bank|transfer|wire)\b|העברה|בנק/.test(v)) return 'bank_transfer';
  return null;
}

export type RowState = 'needs_receipt' | 'sent' | 'old_receipt' | 'not_positive';

export function rowState(row: ImportedIncome): RowState {
  if (row.payment_id) return 'sent';
  if (row.receipt_number || row.receipt_book) return 'old_receipt';
  if (!(row.amount_minor > 0)) return 'not_positive';
  return 'needs_receipt';
}

function tokens(value: string | null | undefined): string[] {
  return normalise(value).split(' ').filter((w) => w.length > 1);
}

/**
 * Pure: the client this row is most likely for, so their email can be prefilled. Only a single
 * clear match counts: the same name; a client named like the job ("Cohen W"); or one client
 * whose name starts with the payer's surname. Anything less certain is left for the studio.
 */
export function guessClient(row: Pick<ImportedIncome, 'payer_name' | 'job_name'>, clients: ClientContact[]): ClientContact | null {
  const withEmail = clients.filter((c) => c.email);
  const unique = (list: ClientContact[]) => {
    const ids = new Set(list.map((c) => c.id));
    return ids.size === 1 ? list[0] : null;
  };
  const payer = normalise(row.payer_name);
  const job = normalise(row.job_name);
  if (payer) {
    const same = unique(withEmail.filter((c) => normalise(c.name) === payer));
    if (same) return same;
  }
  if (job) {
    const sameJob = unique(withEmail.filter((c) => normalise(c.name) === job));
    if (sameJob) return sameJob;
  }
  const payerWords = tokens(row.payer_name);
  const surname = payerWords[payerWords.length - 1];
  const jobFirst = tokens(row.job_name)[0];
  const keys = new Set([surname, jobFirst].filter((k): k is string => !!k && k.length > 2));
  if (keys.size === 0) return null;
  return unique(withEmail.filter((c) => keys.has(tokens(c.name)[0] ?? '')));
}

export type SendRefusal =
  | 'not_found'
  | 'already_sent'
  | 'has_old_receipt'
  | 'not_positive'
  | 'no_name'
  | 'no_email'
  | 'no_method'
  | 'failed';

export type SendResult =
  | { income_id: string; ok: true; payment_id: string }
  | { income_id: string; ok: false; reason: SendRefusal };

export const ImportedReceiptsService = {
  async list(tenantId: string): Promise<ImportedIncome[]> {
    const { data, error } = await supabase
      .from('imported_income')
      .select(
        'id, income_date, amount_minor, payer_name, payer_email, payment_method, job_name, receipt_book, receipt_number, payment_id, payment:payments(external_document_number, invoice_url)',
      )
      .eq('tenant_id', tenantId)
      .order('income_date', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as unknown as ImportedIncome[];
  },

  async clients(tenantId: string): Promise<ClientContact[]> {
    const { data, error } = await supabase
      .from('people')
      .select('id, name, email')
      .eq('tenant_id', tenantId)
      .not('email', 'is', null)
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as ClientContact[];
  },

  /** Sends in groups of RECEIPTS_PER_REQUEST; results come back per row. */
  async send(rows: Array<{ income_id: string; email?: string; method?: OfflineMethod }>): Promise<SendResult[]> {
    const results: SendResult[] = [];
    for (let i = 0; i < rows.length; i += RECEIPTS_PER_REQUEST) {
      const { data, error } = await supabase.functions.invoke('send-imported-receipts', {
        body: { rows: rows.slice(i, i + RECEIPTS_PER_REQUEST) },
      });
      const parsed = await parseFunctionInvokeBody(data, error);
      if (error || (parsed && typeof parsed.error === 'string')) {
        if (parsed?.error === 'receipts_unavailable') throw new Error('receipts_unavailable');
        throw new Error(functionInvokeErrorMessage(error, parsed, 'Could not send the receipts'));
      }
      results.push(...(((parsed ?? data) as { results?: SendResult[] })?.results ?? []));
    }
    return results;
  },
};

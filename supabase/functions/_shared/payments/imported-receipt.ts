import { z } from "npm:zod@4.6.7";

/**
 * Finance -> Import -> "Send receipt": an imported income row becomes a payment recorded by
 * hand, and the studio's invoicing service issues the receipt. Everything comes from the row
 * (amount, payer name, date, method); the studio only adds what the sheet didn't have.
 * Pure helpers here; the edge function (send-imported-receipts) does the writes.
 */

export const OFFLINE_METHODS = ["cash", "bank_transfer", "bit"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

/** At most this many rows per press, so one request stays well inside the function's time. */
export const MAX_RECEIPTS_PER_REQUEST = 50;

export const SendImportedReceiptsSchema = z.object({
  rows: z
    .array(
      z.object({
        income_id: z.string().guid(),
        /** Typed or picked by the studio when the sheet had no email. */
        email: z.string().trim().toLowerCase().email().max(320).optional(),
        /** Chosen by the studio when the sheet's method isn't cash, bank transfer or Bit. */
        method: z.enum(OFFLINE_METHODS).optional(),
      }),
    )
    .min(1)
    .max(MAX_RECEIPTS_PER_REQUEST),
});
export type SendImportedReceiptsInput = z.infer<typeof SendImportedReceiptsSchema>;

/** Pure: the sheet's method text as one of ours, or null when it can't be told. */
export function offlineMethodFromSheet(value: string | null | undefined): OfflineMethod | null {
  const v = String(value ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (/\b(bit|paybox|pay box)\b|ביט|פייבוקס/.test(v)) return "bit";
  if (/\bcash\b|מזומן/.test(v)) return "cash";
  if (/\b(bank|transfer|wire)\b|העברה|בנק/.test(v)) return "bank_transfer";
  return null;
}

export interface ImportedIncomeRow {
  id: string;
  tenant_id: string;
  income_date: string;
  amount_minor: number;
  payer_name: string | null;
  payer_email: string | null;
  payment_method: string | null;
  job_name: string | null;
  receipt_book: string | null;
  receipt_number: string | null;
  payment_id: string | null;
}

export type RowRefusal =
  | "not_found"
  | "already_sent"
  | "has_old_receipt"
  | "not_positive"
  | "no_name"
  | "no_email"
  | "no_method";

/** Pure: what this row would be sent with, or why it can't be sent. */
export function planImportedReceipt(
  row: ImportedIncomeRow | null | undefined,
  tenantId: string,
  overrides: { email?: string; method?: OfflineMethod },
): { ok: true; email: string; method: OfflineMethod; name: string } | { ok: false; reason: RowRefusal } {
  if (!row || row.tenant_id !== tenantId) return { ok: false, reason: "not_found" };
  if (row.payment_id) return { ok: false, reason: "already_sent" };
  if (row.receipt_number || row.receipt_book) return { ok: false, reason: "has_old_receipt" };
  if (!(row.amount_minor > 0)) return { ok: false, reason: "not_positive" };
  const name = row.payer_name?.trim();
  if (!name) return { ok: false, reason: "no_name" };
  const email = (overrides.email ?? row.payer_email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "no_email" };
  const method = overrides.method ?? offlineMethodFromSheet(row.payment_method);
  if (!method) return { ok: false, reason: "no_method" };
  return { ok: true, email, method, name };
}

/** Pure: noon UTC on the day the money arrived, so the date never shifts in Israel. */
export function paidAtForIncomeDate(incomeDate: string): string {
  return `${incomeDate.slice(0, 10)}T12:00:00.000Z`;
}

/** Pure: the payment row for one imported income row. */
export function importedPaymentRow(input: {
  tenantId: string;
  personId: string;
  accountId: string | null;
  row: ImportedIncomeRow;
  name: string;
  method: OfflineMethod;
  currency: string;
  actorUserId: string;
}) {
  return {
    tenant_id: input.tenantId,
    account_id: input.accountId,
    person_id: input.personId,
    offering_id: null,
    engagement_id: null,
    billing_account_id: null,
    charge_type: "initial",
    provider: "manual",
    // One payment per imported row: a second press hits the unique ref and changes nothing.
    provider_payment_ref: `manual_import_${input.row.id}`,
    payment_method: input.method,
    pretax_amount_minor: 0,
    vat_rate: 0,
    vat_amount_minor: 0,
    total_amount_minor: input.row.amount_minor,
    currency: input.currency.toUpperCase(),
    status: "succeeded",
    paid_at: paidAtForIncomeDate(input.row.income_date),
    description: input.row.job_name?.trim() || null,
    document_name: input.name.slice(0, 200),
    created_by: input.actorUserId,
    approved_by: input.actorUserId,
  };
}

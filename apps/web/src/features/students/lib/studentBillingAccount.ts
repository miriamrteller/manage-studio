import { z } from 'zod';

/**
 * A billing account as stored in billing_accounts (migration 20260608001100): the payer is a
 * person (person_id), with an optional business name. Name and email come from that person.
 * The shared BillingAccountSchema expects account_holder_name / primary_contact_email /
 * payment_method, which are not columns, so real rows never parsed and the student panel
 * always said "No billing account linked".
 */
export const STUDENT_BILLING_ACCOUNT_SELECT =
  'id, tenant_id, person_id, account_id, status, business_name, created_at, updated_at, payer:people!billing_accounts_person_id_fkey(name, email)';

const RowSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  business_name: z.string().nullable().optional(),
  payer: z
    .object({ name: z.string().nullable().optional(), email: z.string().nullable().optional() })
    .nullable()
    .optional(),
});

export interface SavedCard {
  brand: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

export interface StudentBillingAccount {
  id: string;
  status: string;
  holderName: string | null;
  holderEmail: string | null;
  businessName: string | null;
  /** Card studios: the saved card used for monthly charges (get_billing_account_payment_method). */
  savedCard?: SavedCard | null;
}

const CardRowSchema = z.object({
  card_brand: z.string().nullable().optional(),
  last4: z.string().nullable().optional(),
  exp_month: z.number().nullable().optional(),
  exp_year: z.number().nullable().optional(),
  is_default: z.boolean().nullable().optional(),
});

/** The default saved card from get_billing_account_payment_method rows, else the first; null if none. */
export function pickSavedCard(rows: unknown): SavedCard | null {
  if (!Array.isArray(rows)) return null;
  const cards = rows
    .map((r) => CardRowSchema.safeParse(r))
    .filter((r): r is z.SafeParseSuccess<z.infer<typeof CardRowSchema>> => r.success && Boolean(r.data.last4))
    .map((r) => r.data);
  const card = cards.find((c) => c.is_default) ?? cards[0];
  if (!card?.last4) return null;
  return {
    brand: card.card_brand ?? null,
    last4: card.last4,
    expMonth: card.exp_month ?? null,
    expYear: card.exp_year ?? null,
  };
}

/** "Visa •••• 4242 (12/27)" — LTR-safe plain text for the billing tab. */
export function formatSavedCard(card: SavedCard): string {
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card';
  const exp =
    card.expMonth && card.expYear
      ? ` (${String(card.expMonth).padStart(2, '0')}/${String(card.expYear % 100).padStart(2, '0')})`
      : '';
  return `${brand} •••• ${card.last4}${exp}`;
}

export function parseStudentBillingAccount(row: unknown): StudentBillingAccount | null {
  const parsed = RowSchema.safeParse(row);
  if (!parsed.success) return null;
  const { id, status, business_name, payer } = parsed.data;
  const businessName = business_name?.trim() || null;
  return {
    id,
    status,
    holderName: payer?.name?.trim() || businessName,
    holderEmail: payer?.email?.trim() || null,
    businessName,
  };
}

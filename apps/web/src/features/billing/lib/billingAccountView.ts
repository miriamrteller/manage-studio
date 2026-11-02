import { z } from 'zod';
import { BillingAccountSchema, type BillingAccount } from '@shared/schemas';
import { pickSavedCard, type SavedCard } from '@/features/students/lib/studentBillingAccount';

export { pickSavedCard };
export type { SavedCard };

/** Real columns plus the payer person (name / email) and household name. `people` has no phone column. */
export const BILLING_ACCOUNT_SELECT =
  'id, tenant_id, account_id, person_id, business_name, business_tax_id, status, created_at, updated_at, ' +
  'payer:people!billing_accounts_person_id_fkey(name, email), ' +
  'household:accounts!billing_accounts_account_id_fkey(name)';

/** Same, with the payer join made inner so a search on payer name/email filters accounts. */
export const BILLING_ACCOUNT_SEARCH_SELECT = BILLING_ACCOUNT_SELECT.replace(
  'people!billing_accounts_person_id_fkey(',
  'people!billing_accounts_person_id_fkey!inner(',
);

const JoinSchema = z.object({
  payer: z
    .object({
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  household: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
});

export interface BillingAccountView extends BillingAccount {
  holderName: string | null;
  holderEmail: string | null;
  /** Card studios: the saved card used for monthly charges; loaded on the detail view only. */
  savedCard?: SavedCard | null;
}

/** Throws on a row that is not a billing account (same contract as BillingAccountSchema.parse). */
export function toBillingAccountView(row: unknown): BillingAccountView {
  const account = BillingAccountSchema.parse(row);
  const joins = JoinSchema.parse(row);
  const clean = (v: string | null | undefined) => v?.trim() || null;
  return {
    ...account,
    holderName:
      clean(joins.payer?.name) ?? clean(joins.household?.name) ?? clean(account.business_name),
    holderEmail: clean(joins.payer?.email),
  };
}

/** PostgREST `or` filter on the payer: name or email contains the query. */
export function payerSearchFilter(query: string): string | null {
  // Commas, parentheses and quotes would break the filter syntax; drop them.
  const q = query.trim().replace(/[,()"*\\]/g, ' ').trim();
  if (!q) return null;
  return `name.ilike.%${q}%,email.ilike.%${q}%`;
}

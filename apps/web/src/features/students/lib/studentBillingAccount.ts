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

export interface StudentBillingAccount {
  id: string;
  status: string;
  holderName: string | null;
  holderEmail: string | null;
  businessName: string | null;
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

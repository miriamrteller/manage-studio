/**
 * Resolves payer contact details for a YPay charge.
 *
 * YPay's /payment `contact` requires email + name (both mandatory). Details come from
 * the billing account's contact person.
 *
 * SCHEMA WART (shared with Invoice4U): the payer phone lives in
 * people.emergency_contact_phone — for a guardian record that column holds their own
 * number (guest_enrolment_create_family writes it there). `people` has no dedicated
 * phone column. Kept YPay-local so providers stay decoupled.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export type YpayCustomer = {
  name: string;
  email: string;
  phone: string | null;
  businessId: string | null;
};

export async function resolveYpayCustomer(
  service: SupabaseClient,
  billingAccountId: string,
): Promise<YpayCustomer> {
  const { data: billingAccount, error: billingError } = await service
    .from("billing_accounts")
    .select("person_id, account_id, business_name, business_tax_id")
    .eq("id", billingAccountId)
    .single();

  if (billingError || !billingAccount) {
    throw new Error(`YPay: billing account ${billingAccountId} not found`);
  }

  let personId = billingAccount.person_id as string | null;
  if (!personId && billingAccount.account_id) {
    const { data: account } = await service
      .from("accounts")
      .select("person_id")
      .eq("id", billingAccount.account_id as string)
      .single();
    personId = (account?.person_id as string | null) ?? null;
  }

  if (!personId) {
    throw new Error(`YPay: billing account ${billingAccountId} resolves to no contact person`);
  }

  const { data: person, error: personError } = await service
    .from("people")
    .select("name, email, emergency_contact_phone")
    .eq("id", personId)
    .single();

  if (personError || !person) {
    throw new Error(`YPay: contact person ${personId} not found`);
  }

  const name =
    (billingAccount.business_name as string | null)?.trim() ||
    (person.name as string | null)?.trim();
  const email = (person.email as string | null)?.trim();

  if (!name) throw new Error(`YPay: contact person ${personId} has no name`);
  if (!email) throw new Error(`YPay: contact person ${personId} has no email (required by YPay)`);

  return {
    name,
    email,
    phone: (person.emergency_contact_phone as string | null)?.trim() || null,
    businessId: (billingAccount.business_tax_id as string | null)?.trim() || null,
  };
}

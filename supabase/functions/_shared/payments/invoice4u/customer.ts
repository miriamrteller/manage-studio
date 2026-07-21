/**
 * Resolves payer contact details for an Invoice4U clearing request.
 *
 * ProcessApiRequestV2 requires either an existing `CustomerId` or `FullName` + `Phone`.
 * A first hosted charge has no CustomerId, so the payer's details must come from the
 * billing account.
 *
 * SCHEMA WART: the payer's phone lives in `people.emergency_contact_phone`. For a
 * guardian record that column holds their OWN number — guest_enrolment_create_family
 * writes p_guardian_phone straight into it — so despite the name it is the correct
 * value here. `people` has no dedicated phone column; the only `phone` in the schema is
 * on `staff`. Worth renaming, but not while it is load-bearing for enrolment.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export type Invoice4uCustomer = {
  fullName: string;
  email: string | null;
  phone: string | null;
};

type PersonRow = {
  name: string | null;
  email: string | null;
  emergency_contact_phone: string | null;
};

/**
 * A billing account points at either a person directly or an account whose
 * `person_id` is the primary contact. Both resolve to a `people` row.
 */
export async function resolveInvoice4uCustomer(
  service: SupabaseClient,
  billingAccountId: string,
): Promise<Invoice4uCustomer> {
  const { data: billingAccount, error: billingError } = await service
    .from("billing_accounts")
    .select("person_id, account_id, business_name")
    .eq("id", billingAccountId)
    .single();

  if (billingError || !billingAccount) {
    throw new Error(`Invoice4U: billing account ${billingAccountId} not found`);
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
    throw new Error(
      `Invoice4U: billing account ${billingAccountId} resolves to no contact person`,
    );
  }

  const { data: person, error: personError } = await service
    .from("people")
    .select("name, email, emergency_contact_phone")
    .eq("id", personId)
    .single();

  if (personError || !person) {
    throw new Error(`Invoice4U: contact person ${personId} not found`);
  }

  const row = person as PersonRow;

  // Prefer the business name on B2B accounts — it is what belongs on the tax document.
  const fullName = (billingAccount.business_name as string | null)?.trim() || row.name?.trim();

  if (!fullName) {
    throw new Error(`Invoice4U: contact person ${personId} has no name`);
  }

  return {
    fullName,
    email: row.email?.trim() || null,
    phone: row.emergency_contact_phone?.trim() || null,
  };
}

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

/** Resolve payer + billing account for a student engagement (matches guest_enrolment_create_engagement). */
export async function ensureBillingAccountForStudent(
  service: SupabaseClient,
  tenantId: string,
  studentPersonId: string,
): Promise<string> {
  const { data: student, error: studentError } = await service
    .from("people")
    .select("account_id")
    .eq("id", studentPersonId)
    .eq("tenant_id", tenantId)
    .single();

  if (studentError || !student) {
    throw new Error("Student not found for billing account");
  }

  let payerPersonId = studentPersonId;

  if (student.account_id) {
    const { data: holder } = await service
      .from("account_members")
      .select("person_id")
      .eq("account_id", student.account_id)
      .eq("role", "account_holder")
      .limit(1)
      .maybeSingle();

    if (holder?.person_id) {
      payerPersonId = holder.person_id as string;
    }
  }

  const { data: payer, error: payerError } = await service
    .from("people")
    .select("account_id")
    .eq("id", payerPersonId)
    .eq("tenant_id", tenantId)
    .single();

  if (payerError || !payer) {
    throw new Error("Payer not found for billing account");
  }

  const payerAccountId = (payer.account_id as string | null) ?? null;

  if (payerAccountId) {
    const { data: householdBilling } = await service
      .from("billing_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("account_id", payerAccountId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (householdBilling?.id) {
      return householdBilling.id as string;
    }
  }

  const { data: personBilling } = await service
    .from("billing_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("person_id", payerPersonId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (personBilling?.id) {
    return personBilling.id as string;
  }

  const { data: created, error: createError } = await service
    .from("billing_accounts")
    .insert({
      tenant_id: tenantId,
      account_id: payerAccountId,
      person_id: payerPersonId,
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? "Failed to create billing account");
  }

  return created.id as string;
}

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

/**
 * Returns all recipient emails that are valid for a tokenized enrolment link:
 * - account-holder/guardian email when present
 * - student email as fallback
 * - any audited admin override recipient for this engagement
 */
export async function resolveAllowedTokenRecipientEmails(
  service: SupabaseClient,
  params: {
    tenantId: string;
    engagementId: string;
    personId: string;
  },
): Promise<Set<string>> {
  const { tenantId, engagementId, personId } = params;
  const allowed = new Set<string>();

  const { data: student } = await service
    .from("people")
    .select("email, account_id")
    .eq("id", personId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const studentEmail = normalizeEmail(student?.email as string | null | undefined);
  if (studentEmail) allowed.add(studentEmail);

  if (student?.account_id) {
    const { data: holder } = await service
      .from("account_members")
      .select("person_id")
      .eq("tenant_id", tenantId)
      .eq("account_id", student.account_id)
      .eq("role", "account_holder")
      .limit(1)
      .maybeSingle();

    if (holder?.person_id) {
      const { data: guardian } = await service
        .from("people")
        .select("email")
        .eq("id", holder.person_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      const guardianEmail = normalizeEmail(guardian?.email as string | null | undefined);
      if (guardianEmail) allowed.add(guardianEmail);
    }
  }

  // Include any explicit admin override recipients that were audit-logged.
  const { data: auditRows } = await service
    .from("audit_log")
    .select("after_state")
    .eq("tenant_id", tenantId)
    .eq("action", "admin.enrolment_link_sent")
    .eq("entity_type", "engagement")
    .eq("entity_id", engagementId)
    .order("created_at", { ascending: false })
    .limit(50);

  for (const row of auditRows ?? []) {
    const recipient = normalizeEmail(
      (row as { after_state?: Record<string, unknown> | null }).after_state
        ?.recipient_email as string | undefined,
    );
    if (recipient) allowed.add(recipient);
  }

  return allowed;
}

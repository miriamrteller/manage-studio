import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

async function resolvePersonEmail(
  service: SupabaseClient,
  person: { email?: string | null; user_profile_id?: string | null },
): Promise<string | null> {
  const direct = normalizeEmail(person.email as string | null | undefined);
  if (direct) return direct;

  if (!person.user_profile_id) return null;

  const { data: profile } = await service
    .from("user_profiles")
    .select("email")
    .eq("id", person.user_profile_id)
    .maybeSingle();

  return normalizeEmail(profile?.email as string | null | undefined);
}

/** Guardian (account holder) email, or student email when enrolling adults. */
export async function resolveEnrolmentNotificationRecipient(
  service: SupabaseClient,
  tenantId: string,
  personId: string,
): Promise<{ email: string; name: string; personId: string } | null> {
  const { data: student, error: studentError } = await service
    .from("people")
    .select("email, name, account_id, user_profile_id")
    .eq("id", personId)
    .eq("tenant_id", tenantId)
    .single();

  if (studentError || !student) return null;

  const studentEmail = await resolvePersonEmail(service, student);
  if (studentEmail) {
    return {
      email: studentEmail,
      name: (student.name as string) ?? "",
      personId,
    };
  }

  if (!student.account_id) return null;

  const { data: accountHolder } = await service
    .from("account_members")
    .select("person_id")
    .eq("tenant_id", tenantId)
    .eq("account_id", student.account_id)
    .eq("role", "account_holder")
    .limit(1)
    .maybeSingle();

  if (!accountHolder?.person_id) return null;

  const { data: guardian } = await service
    .from("people")
    .select("email, name, user_profile_id")
    .eq("id", accountHolder.person_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const guardianEmail = guardian ? await resolvePersonEmail(service, guardian) : null;
  if (!guardianEmail) return null;

  return {
    email: guardianEmail,
    name: (guardian?.name as string) ?? (student.name as string) ?? "",
    personId: accountHolder.person_id as string,
  };
}

/** Last admin completion-link recipient for this engagement, if any. */
export async function resolveAdminLinkRecipientEmail(
  service: SupabaseClient,
  tenantId: string,
  engagementId: string,
): Promise<string | null> {
  const { data: auditRow } = await service
    .from("audit_log")
    .select("after_state")
    .eq("tenant_id", tenantId)
    .eq("action", "admin.enrolment_link_sent")
    .eq("entity_type", "engagement")
    .eq("entity_id", engagementId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recipient = (auditRow?.after_state as { recipient_email?: string } | null)?.recipient_email;
  return normalizeEmail(recipient);
}

/** Tenant admin inboxes for operational notifications (e.g. new appointment bookings). */
export async function resolveTenantAdminNotificationEmails(
  service: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data: rows } = await service
    .from("user_profiles")
    .select("email")
    .eq("tenant_id", tenantId)
    .contains("role", ["tenant_admin"]);

  const emails = new Set<string>();
  for (const row of rows ?? []) {
    const email = normalizeEmail(row.email as string | null | undefined);
    if (email) emails.add(email);
  }
  return [...emails];
}

/**
 * One plain announcement email (no React), logged in notification_log under a
 * dunning_key so a retry never sends twice. Used by the photo shop and the
 * studio shop. A failed send is logged, never thrown.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { sendHtmlEmail } from "./email-client.ts";
import { renderAdminAnnouncementHtml } from "./render-admin-announcement-email.ts";
import { resolveTenantSender, type TenantSenderInput } from "./notification-from.ts";

/** True when an email with this dunning_key was already sent (or is on its way). */
export async function announcementAlreadySent(service: SupabaseClient, tenantId: string, key: string): Promise<boolean> {
  const { data } = await service
    .from("notification_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .filter("variables->>dunning_key", "eq", key)
    .in("status", ["sent", "delivered", "read", "pending"])
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export interface LoggedAnnouncement {
  /** The tenant row: name, language_default, colours and the sender columns. */
  tenant: Record<string, unknown>;
  tenantId: string;
  to: string;
  personId: string | null;
  key: string;
  templateName: string;
  subject: string;
  body: string;
  /** Extra variables stored with the log row (e.g. the order id). */
  variables?: Record<string, unknown>;
}

/** Sends the email and logs it. Returns true when it was sent. */
export async function sendLoggedAnnouncement(service: SupabaseClient, p: LoggedAnnouncement): Promise<boolean> {
  const sender = resolveTenantSender(p.tenant as unknown as TenantSenderInput);
  const language = p.tenant.language_default === "en" ? "en" : "he";
  const variables = { dunning_key: p.key, ...(p.variables ?? {}), subject: p.subject, body: p.body };
  let status = "sent";
  let failure: string | null = null;
  let externalId: string | null = null;
  try {
    const html = renderAdminAnnouncementHtml({
      language,
      schoolName: p.tenant.name as string,
      subject: p.subject,
      body: p.body,
      primaryColor: (p.tenant.primary_color as string | null) ?? "#2563eb",
      accentColor: (p.tenant.accent_color as string | null) ?? "#dc2626",
    });
    const result = await sendHtmlEmail({ to: p.to, from: sender.from, replyTo: sender.replyTo, subject: p.subject, html });
    externalId = result.id ?? null;
  } catch (err) {
    status = "failed";
    failure = err instanceof Error ? err.message : "Email delivery failed";
  }
  try {
    await service.from("notification_log").insert({
      tenant_id: p.tenantId,
      recipient_person_id: p.personId,
      recipient_email: p.to,
      channel: "email",
      template_name: p.templateName,
      variables,
      external_msg_id: externalId,
      status,
      failure_reason: failure,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  } catch {
    // Logging must never mask the outcome.
  }
  return status === "sent";
}

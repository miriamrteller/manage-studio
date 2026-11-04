/**
 * Photo shop emails (plain announcement layout, no React):
 *  - to the studio when an order is paid (or free): the photos to put in a
 *    download gallery, with their gallery keys and file names;
 *  - to the client when the studio sends the download link.
 * Each send is logged in notification_log under a dunning_key, so a retry
 * never sends twice. A failed email never undoes the order or the payment.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency } from "../email-dist/format.js";
import { sendHtmlEmail } from "../email-client.ts";
import { renderAdminAnnouncementHtml } from "../render-admin-announcement-email.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../notification-from.ts";
import { tenantBaseUrl } from "../tenant-url.ts";
import { buildClientDeliveredEmail, buildStudioOrderEmail, type Lang } from "./email-copy.ts";

interface Loaded {
  order: {
    id: string;
    tenant_id: string;
    engagement_id: string;
    status: string;
    photo_count: number;
    total_minor: number;
    currency: string;
    delivery_url: string | null;
    delivered_at: string | null;
  };
  items: { image_key: string; file_name: string }[];
  tenant: Record<string, unknown>;
  personId: string;
}

async function load(service: SupabaseClient, orderId: string): Promise<Loaded | null> {
  const { data: order } = await service
    .from("job_photo_orders")
    .select("id, tenant_id, engagement_id, status, photo_count, total_minor, currency, delivery_url, delivered_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;
  const [{ data: items }, { data: tenant }, { data: engagement }] = await Promise.all([
    service.from("job_photo_order_items").select("image_key, file_name").eq("order_id", orderId).order("created_at"),
    service
      .from("tenants")
      .select(`id, name, language_default, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
      .eq("id", order.tenant_id)
      .maybeSingle(),
    service.from("engagements").select("person_id").eq("id", order.engagement_id).maybeSingle(),
  ]);
  if (!tenant || !engagement?.person_id) return null;
  return {
    order: order as Loaded["order"],
    items: (items ?? []) as Loaded["items"],
    tenant: tenant as Record<string, unknown>,
    personId: engagement.person_id as string,
  };
}

async function alreadySent(service: SupabaseClient, tenantId: string, key: string): Promise<boolean> {
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

async function send(
  service: SupabaseClient,
  l: Loaded,
  p: { to: string; personId: string | null; key: string; templateName: string; subject: string; body: string },
): Promise<boolean> {
  const sender = resolveTenantSender(l.tenant as unknown as TenantSenderInput);
  const language: Lang = l.tenant.language_default === "en" ? "en" : "he";
  const variables = { dunning_key: p.key, photo_order_id: l.order.id, subject: p.subject, body: p.body };
  let status = "sent";
  let failure: string | null = null;
  let externalId: string | null = null;
  try {
    // Plain announcement layout, rendered without React so payment code that imports this stays light.
    const html = renderAdminAnnouncementHtml({
      language,
      schoolName: l.tenant.name as string,
      subject: p.subject,
      body: p.body,
      primaryColor: (l.tenant.primary_color as string | null) ?? "#2563eb",
      accentColor: (l.tenant.accent_color as string | null) ?? "#dc2626",
    });
    const result = await sendHtmlEmail({ to: p.to, from: sender.from, replyTo: sender.replyTo, subject: p.subject, html });
    externalId = result.id ?? null;
  } catch (err) {
    status = "failed";
    failure = err instanceof Error ? err.message : "Email delivery failed";
  }
  try {
    await service.from("notification_log").insert({
      tenant_id: l.order.tenant_id,
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

const lang = (t: Record<string, unknown>): Lang => (t.language_default === "en" ? "en" : "he");

/** Tell the studio about a paid (or free) order. Safe to call more than once. */
export async function notifyStudioPhotoOrderPaid(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || (l.order.status !== "paid" && l.order.status !== "delivered")) return false;
  const key = `photo_order:${orderId}:paid`;
  if (await alreadySent(service, l.order.tenant_id, key)) return false;

  const { data: client } = await service.from("people").select("name").eq("id", l.personId).maybeSingle();
  const language = lang(l.tenant);
  const email = buildStudioOrderEmail({
    language,
    clientName: (client?.name as string | undefined) ?? "—",
    totalFormatted: formatCurrency(l.order.total_minor, l.order.currency, language === "he" ? "he-IL" : "en-GB"),
    photos: l.items.map((i) => ({ fileName: i.file_name, key: i.image_key })),
    shootUrl: `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/admin/jobs/${l.order.engagement_id}`,
  });
  const to = String(l.tenant.contact_email ?? "").trim();
  if (!to) return false;
  return send(service, l, { to, personId: null, key, templateName: "photo_order_paid", ...email });
}

/** Tell the client their download link is ready. Each new link is sent once. */
export async function notifyClientPhotoOrderDelivered(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || l.order.status !== "delivered" || !l.order.delivery_url) return false;
  const key = `photo_order:${orderId}:delivered:${l.order.delivered_at}`;
  if (await alreadySent(service, l.order.tenant_id, key)) return false;

  const recipient = await resolveEnrolmentNotificationRecipient(service, l.order.tenant_id, l.personId);
  if (!recipient) return false;
  const email = buildClientDeliveredEmail({
    language: lang(l.tenant),
    studioName: l.tenant.name as string,
    photoCount: l.order.photo_count,
    downloadUrl: l.order.delivery_url,
    portalUrl: `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/dashboard/portal`,
  });
  return send(service, l, {
    to: recipient.email,
    personId: recipient.personId,
    key,
    templateName: "photo_order_delivered",
    ...email,
  });
}

/** Called once a job payment request is paid: emails the studio if it was a photo order. Never throws. */
export async function notifyIfPhotoOrderPaid(service: SupabaseClient, requestId: string): Promise<void> {
  try {
    const { data } = await service
      .from("job_photo_orders")
      .select("id")
      .eq("job_payment_request_id", requestId)
      .maybeSingle();
    if (data?.id) await notifyStudioPhotoOrderPaid(service, data.id as string);
  } catch (err) {
    console.error("[photo-shop] order email failed", err);
  }
}

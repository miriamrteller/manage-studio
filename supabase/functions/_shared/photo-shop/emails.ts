/**
 * Photo shop emails (plain announcement layout):
 *  - to the studio when an order is paid (or free): the photos to put in a
 *    download gallery, with their gallery keys and file names;
 *  - to the client when the studio sends the download link.
 * Each send is logged in notification_log under a dunning_key, so a retry
 * never sends twice. A failed email never undoes the order or the payment.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency } from "../email-dist/format.js";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../email-send.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../notification-from.ts";
import { tenantBaseUrl } from "../tenant-url.ts";

type Lang = "he" | "en";

export interface StudioOrderEmailInput {
  language: Lang;
  clientName: string;
  totalFormatted: string;
  photos: { fileName: string; key: string }[];
  shootUrl: string;
}

export function buildStudioOrderEmail(i: StudioOrderEmailInput): { subject: string; body: string } {
  const list = i.photos.map((p) => `• ${p.fileName} (${p.key})`).join("\n");
  if (i.language === "he") {
    return {
      subject: `הזמנת תמונות חדשה: ${i.clientName} (${i.photos.length})`,
      body:
        `${i.clientName} קנה/תה ${i.photos.length} תמונות, בסך ${i.totalFormatted}.\n\n` +
        `התמונות:\n${list}\n\n` +
        `יש ליצור ב-SmugMug גלריית הורדה עם התמונות האלה, להדביק את הקישור בהזמנה וללחוץ על שליחה:\n${i.shootUrl}`,
    };
  }
  return {
    subject: `New photo order: ${i.clientName} (${i.photos.length})`,
    body:
      `${i.clientName} bought ${i.photos.length} photos, ${i.totalFormatted} in total.\n\n` +
      `The photos:\n${list}\n\n` +
      `Make a download gallery on SmugMug with these photos, paste its link into the order and press Send:\n${i.shootUrl}`,
  };
}

export function buildClientDeliveredEmail(
  i: { language: Lang; studioName: string; photoCount: number; downloadUrl: string; portalUrl: string },
): { subject: string; body: string } {
  if (i.language === "he") {
    return {
      subject: "התמונות שלך מוכנות להורדה",
      body:
        `${i.studioName} שלח/ה את ${i.photoCount === 1 ? "התמונה שקנית" : `${i.photoCount} התמונות שקנית`}.\n\n` +
        `להורדה:\n${i.downloadUrl}\n\n` +
        `הקישור נמצא גם בחשבון שלך:\n${i.portalUrl}`,
    };
  }
  return {
    subject: "Your photos are ready to download",
    body:
      `${i.studioName} has sent ${i.photoCount === 1 ? "the photo you bought" : `the ${i.photoCount} photos you bought`}.\n\n` +
      `Download them here:\n${i.downloadUrl}\n\n` +
      `The link is also in your account:\n${i.portalUrl}`,
  };
}

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
    const result = await sendRenderedEmail({
      to: p.to,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: p.subject,
      renderInput: {
        templateName: EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT,
        language,
        schoolName: l.tenant.name as string,
        tenantColors: {
          primary_color: l.tenant.primary_color as string | null,
          accent_color: l.tenant.accent_color as string | null,
        },
        variables,
      },
    });
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

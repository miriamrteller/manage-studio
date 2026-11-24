/**
 * Photo shop emails (plain announcement layout, no React):
 *  - to the studio when an order is paid (or free): the photos to put in a
 *    download gallery, with their gallery keys and file names;
 *  - to the client when the studio sends the download link;
 *  - to the client, an order sent in to pay by Bit or bank transfer: the studio's details.
 * Each send is logged in notification_log under a dunning_key, so a retry
 * never sends twice. A failed email never undoes the order or the payment.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency } from "../email-dist/format.js";
import { announcementAlreadySent, sendLoggedAnnouncement } from "../logged-announcement.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import { TENANT_SENDER_COLUMNS } from "../notification-from.ts";
import { tenantBaseUrl } from "../tenant-url.ts";
import {
  buildClientDeliveredEmail,
  buildClientPayDirectEmail,
  buildClientProofReminderEmail,
  buildStudioOrderEmail,
  buildStudioProofEmail,
  type Lang,
} from "./email-copy.ts";
import {
  asksForProof,
  isPayDirectMethod,
  type PayDirect,
  payDirectHow,
  payDirectWaysText,
  studioPayDirect,
} from "./pay-direct.ts";
import { proofReminderDue } from "./payment-proof.ts";
import { resolveEmailLanguage } from "../resolve-email-language.ts";

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
  items: {
    image_key: string;
    file_name: string;
    kind?: string;
    product_name_en?: string | null;
    product_name_he?: string | null;
    product_size?: string | null;
  }[];
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
    service
      .from("job_photo_order_items")
      .select("image_key, file_name, kind, product_name_en, product_name_he, product_size")
      .eq("order_id", orderId)
      .order("created_at"),
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

function send(
  service: SupabaseClient,
  l: Loaded,
  p: {
    to: string;
    personId: string | null;
    key: string;
    templateName: string;
    subject: string;
    body: string;
    language?: Lang;
  },
): Promise<boolean> {
  return sendLoggedAnnouncement(service, {
    ...p,
    tenant: l.tenant,
    tenantId: l.order.tenant_id,
    variables: { photo_order_id: l.order.id },
  });
}

const lang = (t: Record<string, unknown>): Lang => (t.language_default === "en" ? "en" : "he");

/** Client emails go in the client's own language (see resolve-email-language.ts). */
const clientLang = (service: SupabaseClient, l: Loaded, personId: string): Promise<Lang> =>
  resolveEmailLanguage(service, {
    tenantId: l.order.tenant_id,
    personId,
    tenantDefault: l.tenant.language_default as string | null,
  });

/** "IMG_0001.jpg" for a digital file; "IMG_0001.jpg: Canvas print, 20x30 cm" for a product. */
export function orderLineName(i: Loaded["items"][number], language: Lang): string {
  if (i.kind !== "product") return i.file_name;
  const name = (language === "he" ? i.product_name_he : i.product_name_en) ?? i.product_name_en ?? "";
  return `${i.file_name}: ${[name, i.product_size].filter(Boolean).join(", ")}`;
}

/** Tell the studio about a paid (or free) order. Safe to call more than once. */
export async function notifyStudioPhotoOrderPaid(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || (l.order.status !== "paid" && l.order.status !== "delivered")) return false;
  const key = `photo_order:${orderId}:paid`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;

  const { data: client } = await service.from("people").select("name").eq("id", l.personId).maybeSingle();
  const language = lang(l.tenant);
  const email = buildStudioOrderEmail({
    language,
    clientName: (client?.name as string | undefined) ?? "—",
    totalFormatted: formatCurrency(l.order.total_minor, l.order.currency, language === "he" ? "he-IL" : "en-GB"),
    photos: l.items.map((i) => ({ fileName: orderLineName(i, language), key: i.image_key })),
    shootUrl: `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/admin/jobs/${l.order.engagement_id}`,
  });
  const to = String(l.tenant.contact_email ?? "").trim();
  if (!to) return false;
  return send(service, l, { to, personId: null, key, templateName: "photo_order_paid", ...email });
}

/** Tell the studio about an order sent in to be paid in cash (not paid yet). Sent once. */
export async function notifyStudioPhotoOrderCash(
  service: SupabaseClient,
  orderId: string,
  payDirect: PayDirect | null = null,
): Promise<boolean> {

  const l = await load(service, orderId);
  if (!l || l.order.status !== "awaiting_payment") return false;
  const key = `photo_order:${orderId}:cash`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;

  const { data: client } = await service.from("people").select("name").eq("id", l.personId).maybeSingle();
  const language = lang(l.tenant);
  const email = buildStudioOrderEmail({
    language,
    clientName: (client?.name as string | undefined) ?? "—",
    totalFormatted: formatCurrency(l.order.total_minor, l.order.currency, language === "he" ? "he-IL" : "en-GB"),
    photos: l.items.map((i) => ({ fileName: orderLineName(i, language), key: i.image_key })),
    shootUrl: `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/admin/jobs/${l.order.engagement_id}`,
    payInCash: true,
    payHow: payDirect ? payDirectHow(language, payDirect.ways.map((w) => w.method)) : null,
  });
  const to = String(l.tenant.contact_email ?? "").trim();
  if (!to) return false;
  return send(service, l, { to, personId: null, key, templateName: "photo_order_cash", ...email });
}

/** Tell the client how to pay an order sent in to pay by Bit or bank transfer. Sent once. */
export async function notifyClientPhotoOrderPayDirect(
  service: SupabaseClient,
  orderId: string,
  pay: PayDirect,
): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || l.order.status !== "awaiting_payment") return false;
  const key = `photo_order:${orderId}:pay_direct`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;

  const recipient = await resolveEnrolmentNotificationRecipient(service, l.order.tenant_id, l.personId);
  if (!recipient) return false;
  const language = await clientLang(service, l, recipient.personId);
  const email = buildClientPayDirectEmail({
    language,
    studioName: l.tenant.name as string,
    photoCount: l.order.photo_count,
    totalFormatted: money(l, language),
    ways: payDirectWaysText(language, pay),
    asksForProof: asksForProof(pay),
    payUrl: payPageUrl(l),
  });
  return send(service, l, {
    to: recipient.email,
    personId: recipient.personId,
    language,
    key,
    templateName: "photo_order_pay_direct",
    ...email,
  });
}

const shootUrl = (l: Loaded) =>
  `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/admin/jobs/${l.order.engagement_id}`;
/** The order's own payment page in the client's portal (pick Bit / bank transfer, send the screenshot). */
const payPageUrl = (l: Loaded) =>
  `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/dashboard/portal/photo-order/${l.order.engagement_id}/${l.order.id}`;
const money = (l: Loaded, language: Lang = lang(l.tenant)) =>
  formatCurrency(l.order.total_minor, l.order.currency, language === "he" ? "he-IL" : "en-GB");

/** Tell the studio a client sent a payment screenshot. Each screenshot is sent once. */
export async function notifyStudioPhotoOrderProof(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l) return false;
  const { data: row } = await service
    .from("job_photo_orders").select("pay_method, proof_sent_at").eq("id", orderId).maybeSingle();
  if (!row?.proof_sent_at) return false;
  const key = `photo_order:${orderId}:proof:${row.proof_sent_at}`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;
  const { data: client } = await service.from("people").select("name").eq("id", l.personId).maybeSingle();
  const email = buildStudioProofEmail({
    language: lang(l.tenant),
    clientName: (client?.name as string | undefined) ?? "—",
    photoCount: l.order.photo_count,
    totalFormatted: money(l),
    payHow: isPayDirectMethod(row.pay_method) ? payDirectHow(lang(l.tenant), [row.pay_method]) : "",
    shootUrl: shootUrl(l),
  });
  const to = String(l.tenant.contact_email ?? "").trim();
  if (!to) return false;
  return send(service, l, { to, personId: null, key, templateName: "photo_order_proof", ...email });
}

/**
 * Hourly: remind clients who chose Bit or bank transfer to send their payment screenshot,
 * at 1, 3 and 7 days. Stops once a screenshot arrives or the order is no longer waiting
 * for payment (the studio recorded it, or it was cancelled). Returns how many were sent.
 */
export async function remindPhotoOrderProofs(service: SupabaseClient, now = new Date()): Promise<number> {
  const { data: due, error } = await service
    .from("job_photo_orders")
    .select("id, tenant_id, created_at, pay_method, proof_reminders_sent")
    .eq("status", "awaiting_payment")
    .eq("proof_requested", true)
    .is("proof_path", null)
    .lt("proof_reminders_sent", 3)
    .lte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .limit(200);
  if (error) {
    console.error("[photo-order-proofs] load failed", error.message);
    return 0;
  }
  let sent = 0;
  for (const o of due ?? []) {
    const n = Number(o.proof_reminders_sent ?? 0);
    if (!proofReminderDue(o.created_at as string, n, now)) continue;
    // The client picked cash or cheque: no screenshot to ask for.
    if (o.pay_method === "cash" || o.pay_method === "cheque") continue;
    try {
      const l = await load(service, o.id as string);
      if (!l || l.order.status !== "awaiting_payment") continue;
      const key = `photo_order:${o.id}:proof_reminder:${n + 1}`;
      // Counted first, so a failed send never repeats every hour.
      await service.from("job_photo_orders")
        .update({ proof_reminders_sent: n + 1, proof_reminded_at: now.toISOString() })
        .eq("id", o.id as string).eq("proof_reminders_sent", n);
      if (await announcementAlreadySent(service, l.order.tenant_id, key)) continue;
      const recipient = await resolveEnrolmentNotificationRecipient(service, l.order.tenant_id, l.personId);
      if (!recipient) continue;
      const pay = await studioPayDirect(service, l.order.tenant_id);
      const language = await clientLang(service, l, recipient.personId);
      const email = buildClientProofReminderEmail({
        language,
        studioName: l.tenant.name as string,
        photoCount: l.order.photo_count,
        totalFormatted: money(l, language),
        ways: payDirectWaysText(language, pay),
        asksForProof: true,
        payUrl: payPageUrl(l),
      });
      if (await send(service, l, { to: recipient.email, personId: recipient.personId, language, key, templateName: "photo_order_proof_reminder", ...email })) sent += 1;
    } catch (e) {
      console.error("[photo-order-proofs] reminder failed", o.id, String(e));
    }
  }
  return sent;
}

/** Tell the client their download link is ready. Each new link is sent once. */
export async function notifyClientPhotoOrderDelivered(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || l.order.status !== "delivered" || !l.order.delivery_url) return false;
  const key = `photo_order:${orderId}:delivered:${l.order.delivered_at}`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;

  const recipient = await resolveEnrolmentNotificationRecipient(service, l.order.tenant_id, l.personId);
  if (!recipient) return false;
  const language = await clientLang(service, l, recipient.personId);
  const email = buildClientDeliveredEmail({
    language,
    studioName: l.tenant.name as string,
    photoCount: l.order.photo_count,
    downloadUrl: l.order.delivery_url,
    portalUrl: `${tenantBaseUrl(l.tenant as { subdomain: string; custom_domain?: string | null })}/dashboard/portal`,
  });
  return send(service, l, {
    to: recipient.email,
    personId: recipient.personId,
    language,
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

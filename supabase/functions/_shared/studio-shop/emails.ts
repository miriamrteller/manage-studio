/**
 * Studio shop emails (plain announcement layout, no React):
 *  - to the studio when a family's order is paid: the items to get ready;
 *  - to the family when the studio marks the order ready to collect.
 * Each send is logged under a dunning_key, so a retry never sends twice.
 * A failed email never undoes the order or the payment.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency } from "../email-dist/format.js";
import { announcementAlreadySent, sendLoggedAnnouncement } from "../logged-announcement.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import { TENANT_SENDER_COLUMNS } from "../notification-from.ts";
import { tenantBaseUrl } from "../tenant-url.ts";
import { buildFamilyShopOrderReadyEmail, buildStudioShopOrderPaidEmail, type Lang, type ShopEmailLine } from "./email-copy.ts";

interface Loaded {
  order: {
    id: string;
    tenant_id: string;
    person_id: string;
    ordered_by: string | null;
    status: string;
    total_minor: number;
    currency: string;
    ready_at: string | null;
  };
  lines: ShopEmailLine[];
  tenant: Record<string, unknown>;
  forName: string;
}

async function load(service: SupabaseClient, orderId: string): Promise<Loaded | null> {
  const { data: order } = await service
    .from("shop_orders")
    .select("id, tenant_id, person_id, ordered_by, status, total_minor, currency, ready_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;
  const [{ data: lines }, { data: tenant }, { data: person }] = await Promise.all([
    service
      .from("shop_order_lines")
      .select("product_name, variant_label, quantity")
      .eq("order_id", orderId)
      .order("position"),
    service
      .from("tenants")
      .select(`id, name, language_default, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
      .eq("id", order.tenant_id)
      .maybeSingle(),
    service.from("people").select("name").eq("id", order.person_id).maybeSingle(),
  ]);
  if (!tenant) return null;
  return {
    order: order as Loaded["order"],
    lines: (lines ?? []).map((l) => ({
      name: l.product_name as string,
      size: l.variant_label as string,
      quantity: l.quantity as number,
    })),
    tenant: tenant as Record<string, unknown>,
    forName: (person?.name as string | undefined) ?? "—",
  };
}

const lang = (t: Record<string, unknown>): Lang => (t.language_default === "en" ? "en" : "he");
const baseUrl = (t: Record<string, unknown>) =>
  tenantBaseUrl(t as { subdomain: string; custom_domain?: string | null });

/** Tell the studio about a paid order. Safe to call more than once. */
export async function notifyStudioShopOrderPaid(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || !["paid", "ready", "collected"].includes(l.order.status)) return false;
  const key = `shop_order:${orderId}:paid`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;
  const to = String(l.tenant.contact_email ?? "").trim();
  if (!to) return false;
  const language = lang(l.tenant);
  const email = buildStudioShopOrderPaidEmail({
    language,
    forName: l.forName,
    totalFormatted: formatCurrency(l.order.total_minor, l.order.currency, language === "he" ? "he-IL" : "en-GB"),
    lines: l.lines,
    shopUrl: `${baseUrl(l.tenant)}/admin/shop`,
  });
  return sendLoggedAnnouncement(service, {
    tenant: l.tenant,
    tenantId: l.order.tenant_id,
    to,
    personId: null,
    key,
    templateName: "shop_order_paid",
    variables: { shop_order_id: orderId },
    ...email,
  });
}

/** Tell the family their order is ready to collect: the person who ordered, else the child's guardian. */
export async function notifyFamilyShopOrderReady(service: SupabaseClient, orderId: string): Promise<boolean> {
  const l = await load(service, orderId);
  if (!l || l.order.status !== "ready") return false;
  const key = `shop_order:${orderId}:ready`;
  if (await announcementAlreadySent(service, l.order.tenant_id, key)) return false;
  const recipient =
    (l.order.ordered_by
      ? await resolveEnrolmentNotificationRecipient(service, l.order.tenant_id, l.order.ordered_by)
      : null) ?? (await resolveEnrolmentNotificationRecipient(service, l.order.tenant_id, l.order.person_id));
  if (!recipient) return false;
  const email = buildFamilyShopOrderReadyEmail({
    language: lang(l.tenant),
    studioName: l.tenant.name as string,
    forName: l.forName,
    lines: l.lines,
    portalUrl: `${baseUrl(l.tenant)}/dashboard/portal`,
  });
  return sendLoggedAnnouncement(service, {
    tenant: l.tenant,
    tenantId: l.order.tenant_id,
    to: recipient.email,
    personId: recipient.personId,
    key,
    templateName: "shop_order_ready",
    variables: { shop_order_id: orderId },
    ...email,
  });
}

/** Called once a job payment request is paid: emails the studio if it was a shop order. Never throws. */
export async function notifyIfShopOrderPaid(service: SupabaseClient, requestId: string): Promise<void> {
  try {
    const { data } = await service
      .from("job_payment_requests")
      .select("shop_order_id")
      .eq("id", requestId)
      .maybeSingle();
    if (data?.shop_order_id) await notifyStudioShopOrderPaid(service, data.shop_order_id as string);
  } catch (err) {
    console.error("[studio-shop] order email failed", err);
  }
}

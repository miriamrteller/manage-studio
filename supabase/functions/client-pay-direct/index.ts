import { handleOptions, internalError, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { resolveCheckoutSession } from "../_shared/checkout-session.ts";
import { loadJobPaymentRequestByToken } from "../_shared/jobs/load-request.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { formatCurrency } from "../_shared/email-dist/format.js";
import { announcementAlreadySent, sendLoggedAnnouncement } from "../_shared/logged-announcement.ts";
import { TENANT_SENDER_COLUMNS } from "../_shared/notification-from.ts";
import { tenantBaseUrl } from "../_shared/tenant-url.ts";
import { decodeProof, detectProofImageType, PROOF_EXTENSION } from "../_shared/photo-shop/payment-proof.ts";
import {
  isPayDirectMethod,
  payDirectHow,
  type PayDirectMethod,
  PROOF_METHODS,
  studioPayDirect,
} from "../_shared/photo-shop/pay-direct.ts";
import { buildStudioPaymentProofEmail } from "../_shared/pay-direct/email-copy.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * Pay the studio directly, from any payment page (owner, 23 Nov 2026: "it should be everywhere").
 *
 * The studio's ways (Bit, bank transfer, cash, cheque: Settings > Online payments,
 * tenant_pay_ways) are shown on:
 *   - /pay/:token: shop orders, class cards, deposits and balances.   { token }
 *   - the enrolment pay step (classes, bookings) when paying at the studio.
 *     { enrolment: { offering_id, engagement_id, enrolment_token? } }   (same check as create-checkout)
 *
 * Actions:
 *   get    → { ways, amountMinor, currency, payable, chosen, proofSentAt }
 *   method → the client picked a way (cash / cheque just confirm).          { method }
 *   (get with Bit / bank transfer on offer starts the 1/3/7-day screenshot reminders:
 *    _shared/pay-direct/reminders.ts, run by expire-scheduling-holds)
 *   proof  → the payment screenshot (PNG, JPEG or WebP, up to 5 MB, base64). { image, method? }
 *            Saved in the private bucket payment-proofs; the studio is emailed.
 *
 * Asked for, never required: nothing here holds, blocks or cancels a payment, an order or a
 * place. The studio still records the payment as before.
 */
const BUCKET = "payment-proofs";

type Subject = {
  tenantId: string;
  personId: string | null;
  payable: boolean;
  amountMinor: number;
  currency: string;
  what: string;
  /** /pay link for a studio shop order: paying the studio directly keeps the order. */
  shopOrderId: string | null;
  key: { payment_request_id: string } | { engagement_id: string };
};

async function resolveSubject(req: Request, service: SupabaseClient, body: Record<string, unknown>):
  Promise<Subject | { error: string; status: number }> {
  if (typeof body.token === "string" && body.token.length >= 16 && body.token.length <= 128) {
    const request = await loadJobPaymentRequestByToken(service, body.token);
    if (!request) return { error: "not_found", status: 404 };
    const { data: engagement } = await service
      .from("engagements").select("person_id, status").eq("id", request.engagement_id).maybeSingle();
    const cancelled = engagement?.status === "cancelled" || engagement?.status === "withdrawn";
    const { data: link } = await service
      .from("job_payment_requests").select("shop_order_id").eq("id", request.id).maybeSingle();
    return {
      tenantId: request.tenant_id,
      personId: (engagement?.person_id as string | undefined) ?? null,
      payable: (request.status === "pending" || request.status === "sent") && !cancelled,
      amountMinor: request.amount_minor,
      currency: request.currency,
      what: request.label,
      shopOrderId: (link?.shop_order_id as string | null | undefined) ?? null,
      key: { payment_request_id: request.id },
    };
  }
  const e = body.enrolment as Record<string, unknown> | undefined;
  if (e && typeof e.offering_id === "string" && typeof e.engagement_id === "string") {
    const resolved = await resolveCheckoutSession(req, {
      offering_id: e.offering_id,
      engagement_id: e.engagement_id,
      ...(typeof e.enrolment_token === "string" ? { enrolment_token: e.enrolment_token } : {}),
    });
    if (!resolved.ok) return { error: "not_found", status: resolved.status === 401 ? 401 : 404 };
    const { session } = resolved;
    const { data: offering } = await service.from("offerings").select("name").eq("id", session.offering.id).maybeSingle();
    return {
      tenantId: session.tenantId,
      personId: session.engagement.person_id,
      payable: session.engagement.status === "pending_payment",
      amountMinor: session.totalMinor,
      currency: session.currency,
      what: (offering?.name as string | undefined) ?? "",
      shopOrderId: null,
      key: { engagement_id: session.engagement.id },
    };
  }
  return { error: "bad_request", status: 400 };
}

async function loadRow(service: SupabaseClient, s: Subject) {
  const [column, value] = Object.entries(s.key)[0] as [string, string];
  const { data } = await service
    .from("client_payment_proofs")
    .select("id, pay_method, proof_path, proof_sent_at, proof_requested")
    .eq(column, value)
    .maybeSingle();
  return data as {
    id: string;
    pay_method: string | null;
    proof_path: string | null;
    proof_sent_at: string | null;
    proof_requested: boolean;
  } | null;
}

/**
 * A studio shop order paid by card is released after 48 hours unpaid (release_stale_shop_orders).
 * Once the client says they pay the studio directly, it waits for the studio instead, like an
 * order sent in to "pay the studio directly" (owner rule: nothing blocks payment).
 */
async function keepShopOrder(service: SupabaseClient, s: Subject) {
  if (!s.shopOrderId) return;
  const { error } = await service
    .from("shop_orders")
    .update({ pay_by_cash: true })
    .eq("id", s.shopOrderId)
    .eq("status", "awaiting_payment");
  if (error) console.error("[client-pay-direct] keep shop order failed", error.message);
}

async function saveRow(service: SupabaseClient, s: Subject, values: Record<string, unknown>) {
  const existing = await loadRow(service, s);
  if (existing) {
    const { error } = await service.from("client_payment_proofs").update(values).eq("id", existing.id);
    return { id: existing.id, previous: existing, error };
  }
  const { data, error } = await service
    .from("client_payment_proofs")
    .insert({ tenant_id: s.tenantId, ...s.key, ...values })
    .select("id")
    .single();
  return { id: (data?.id as string | undefined) ?? "", previous: null, error };
}

async function notifyStudio(service: SupabaseClient, s: Subject, proofId: string, sentAt: string, method: PayDirectMethod | null) {
  const key = `payment_proof:${proofId}:${sentAt}`;
  if (await announcementAlreadySent(service, s.tenantId, key)) return;
  const { data: tenantRow } = await service
    .from("tenants")
    .select(`id, name, language_default, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
    .eq("id", s.tenantId)
    .maybeSingle();
  if (!tenantRow) return;
  const tenant = tenantRow as unknown as Record<string, unknown>;
  const to = String(tenant.contact_email ?? "").trim();
  if (!to) return;
  const language = tenant.language_default === "en" ? "en" : "he";
  const { data: person } = s.personId
    ? await service.from("people").select("name").eq("id", s.personId).maybeSingle()
    : { data: null };
  const email = buildStudioPaymentProofEmail({
    language,
    clientName: (person?.name as string | undefined) ?? "—",
    what: s.what || "—",
    totalFormatted: formatCurrency(s.amountMinor, s.currency, language === "he" ? "he-IL" : "en-GB"),
    payHow: method ? payDirectHow(language, [method]) : "",
    proofsUrl: `${tenantBaseUrl(tenant as unknown as { subdomain: string; custom_domain?: string | null })}/admin/finance/payments`,
  });
  await sendLoggedAnnouncement(service, {
    tenant,
    tenantId: s.tenantId,
    to,
    personId: null,
    key,
    templateName: "payment_proof",
    ...email,
    variables: { payment_proof_id: proofId },
  });
}

Deno.serve(withMonitoring("client-pay-direct", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "bad_request" }, 400);
  }
  const action = body.action ?? "get";
  if (action !== "get" && action !== "method" && action !== "proof") return jsonResponse({ error: "bad_request" }, 400);

  try {
    const service = createServiceClient();
    const subject = await resolveSubject(req, service, body);
    if ("error" in subject) return jsonResponse({ error: subject.error }, subject.status);

    if (action === "get") {
      const [pay, row] = await Promise.all([studioPayDirect(service, subject.tenantId), loadRow(service, subject)]);
      // Bit / bank transfer on offer: a screenshot is asked for, and reminders follow at
      // 1, 3 and 7 days from now (owner, 23 Nov 2026). Not again once cash / cheque was picked.
      const asks = (pay?.ways ?? []).some((w) => PROOF_METHODS.includes(w.method));
      if (subject.payable && asks && !row) {
        await saveRow(service, subject, { proof_requested: true }).catch(() => undefined);
      }
      return jsonResponse({
        ways: pay?.ways ?? [],
        amountMinor: subject.amountMinor,
        currency: subject.currency,
        payable: subject.payable,
        chosen: isPayDirectMethod(row?.pay_method) ? row!.pay_method : null,
        proofSentAt: row?.proof_sent_at ?? null,
      });
    }

    if (!subject.payable) return jsonResponse({ error: "already_paid" }, 409);

    if (action === "method") {
      if (!isPayDirectMethod(body.method)) return jsonResponse({ error: "bad_request" }, 400);
      // Bit / bank transfer keep asking for the screenshot; cash / cheque stop the reminders.
      const saved = await saveRow(service, subject, {
        pay_method: body.method,
        proof_requested: PROOF_METHODS.includes(body.method),
      });
      if (saved.error) return jsonResponse({ error: "server_error" }, 500);
      await keepShopOrder(service, subject);
      return jsonResponse({ ok: true });
    }

    // action === "proof"
    const bytes = decodeProof(body.image);
    if (!bytes) return jsonResponse({ error: "proof_too_big" }, 413);
    const type = detectProofImageType(bytes);
    if (!type) return jsonResponse({ error: "proof_not_image" }, 422);
    const method = isPayDirectMethod(body.method) && PROOF_METHODS.includes(body.method) ? body.method : null;
    const folder = Object.values(subject.key)[0];
    const path = `${subject.tenantId}/${folder}/${crypto.randomUUID()}.${PROOF_EXTENSION[type]}`;
    const { error: upError } = await service.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (upError) {
      console.error("[client-pay-direct] upload failed", upError.message);
      return jsonResponse({ error: "server_error" }, 500);
    }
    const sentAt = new Date().toISOString();
    const saved = await saveRow(service, subject, {
      proof_path: path,
      proof_sent_at: sentAt,
      proof_requested: true,
      ...(method ? { pay_method: method } : {}),
    });
    if (saved.error) {
      await service.storage.from(BUCKET).remove([path]);
      return jsonResponse({ error: "server_error" }, 500);
    }
    // A new screenshot replaces the old one.
    const old = saved.previous?.proof_path;
    if (old) await service.storage.from(BUCKET).remove([old]).catch(() => undefined);
    await keepShopOrder(service, subject);
    await notifyStudio(service, subject, saved.id, sentAt, method).catch((e) =>
      console.error("[client-pay-direct] studio email failed", e)
    );
    return jsonResponse({ ok: true, proofSentAt: sentAt });
  } catch (error) {
    console.error("[client-pay-direct]", error);
    return internalError("client-pay-direct", error);
  }
}));

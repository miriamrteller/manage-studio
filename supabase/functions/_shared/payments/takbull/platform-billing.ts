import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { takbullPaymentPageUrl, type TakbullApi, type TakbullOrderRequest, type TakbullTransaction } from "./client.ts";
import { takbullApiForPlatform } from "./index.ts";
import type { TakbullIpn } from "./ipn.ts";
import { takbullOutcome } from "./process-ipn.ts";

/**
 * OpalSwift's own billing of studios (docs/plans/TAKBULL-INTEGRATION.md, step B2): a studio
 * admin adds a card on a Takbull page of OpalSwift's own account. Takbull documents no card
 * save without a charge, so the card is saved with the first month's charge. Each attempt is a
 * platform_payments row; the order_reference is "pb_<row id>" so its notice can't be mistaken
 * for a studio's own payment.
 */

/** Charged when a studio has no monthly price set yet (dev testing: ₪1). */
export const PLATFORM_TEST_AMOUNT_AGOROT = 100;
export const PLATFORM_ORDER_PREFIX = "pb_";

type Env = { get(k: string): string | undefined };
const env = (): Env | undefined => (globalThis as { Deno?: { env: Env } }).Deno?.env;

/** Where Takbull sends the notice for OpalSwift's own orders (the platform-billing-ipn function). */
export function platformBillingIpnUrl(): string {
  const supabaseUrl = env()?.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not set: required for the Takbull notice URL");
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/platform-billing-ipn`;
}

/** Pure: the first day of the month (UTC) that a charge on this date pays for. */
export function periodMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Pure: the first day of the month after a period ("2026-12-01" → "2027-01-01"). */
export function nextMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Pure: "MM/YY" from Takbull's token expiry, or null. */
export function cardExpiry(tx: Pick<TakbullTransaction, "cardTokenExpirationMonth" | "cardTokenExpirationYear">): string | null {
  const m = Number(tx.cardTokenExpirationMonth);
  const y = Number(tx.cardTokenExpirationYear);
  if (!(m >= 1 && m <= 12) || !Number.isFinite(y) || y <= 0) return null;
  return `${String(m).padStart(2, "0")}/${String(y % 100).padStart(2, "0")}`;
}

export interface StudioPayer {
  name: string;
  email: string | null;
  businessNumber: string | null;
}

/**
 * Pure: the order for OpalSwift's page. A regular card deal (the token comes back on every
 * approved card transaction), with OpalSwift's receipt issued by Takbull with the charge, in the
 * account's own default document type.
 */
export function buildPlatformCardOrder(input: {
  paymentId: string;
  amountAgorot: number;
  language: "he" | "en";
  payer: StudioPayer;
  documentType?: number;
  ipnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): TakbullOrderRequest {
  const total = input.amountAgorot / 100;
  const line = input.language === "he" ? "מנוי OpalSwift" : "OpalSwift plan";
  return {
    order_reference: `${PLATFORM_ORDER_PREFIX}${input.paymentId}`,
    OrderTotalSum: total,
    RedirectAddress: input.successUrl,
    CancelReturnAddress: input.cancelUrl,
    IPNAddress: input.ipnUrl,
    DisplayType: "redirect",
    PostProcessMethod: "0",
    Language: input.language,
    Currency: "ILS",
    CustomerFullName: input.payer.name,
    Customer: {
      CustomerFullName: input.payer.name,
      ...(input.payer.email ? { Email: input.payer.email } : {}),
      ...(input.payer.businessNumber ? { IdentityNumber: input.payer.businessNumber } : {}),
    },
    DealType: 1,
    CreateDocument: true,
    ...(input.documentType ? { DocumentType: input.documentType } : {}),
    Products: [{ ProductName: line, Description: line, Price: total, Quantity: 1 }],
  };
}

export type StartCardResult =
  | { ok: true; url: string; paymentId: string; amountAgorot: number }
  | { ok: false; code: "already_paid" | "not_set_up" | "takbull_error"; message?: string };

/** The studio's name, email and business number for OpalSwift's receipt (from its legal details). */
export async function loadStudioPayer(service: SupabaseClient, tenantId: string): Promise<{ payer: StudioPayer; language: "he" | "en" }> {
  const { data } = await service
    .from("tenants")
    .select("name, contact_email, legal_profile, language_default")
    .eq("id", tenantId)
    .single();
  const profile = (data?.legal_profile ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    payer: {
      name: text(profile.legal_name) ?? text(data?.name) ?? "Studio",
      email: text(profile.email) ?? text(data?.contact_email),
      businessNumber: text(profile.business_number),
    },
    language: data?.language_default === "en" ? "en" : "he",
  };
}

/**
 * "Add a card": records a pending charge and opens a Takbull page of OpalSwift's account.
 * The amount is the studio's monthly price, or ₪1 while no price is set (dev testing; on the
 * live site OpalSwift has no keys saved until billing launches). A month already paid is not
 * charged again.
 */
export async function startPlatformCardSetup(
  service: SupabaseClient,
  input: { tenantId: string; returnBaseUrl: string; now?: Date },
  deps: { api?: TakbullApi } = {},
): Promise<StartCardResult> {
  let api: TakbullApi;
  try {
    api = deps.api ?? (await takbullApiForPlatform(service));
  } catch {
    return { ok: false, code: "not_set_up" };
  }
  const period = periodMonth(input.now ?? new Date());

  const { data: attempts } = await service
    .from("platform_payments")
    .select("attempt, status")
    .eq("tenant_id", input.tenantId)
    .eq("period_month", period);
  const rows = (attempts ?? []) as Array<{ attempt: number; status: string }>;
  if (rows.some((r) => r.status === "succeeded")) return { ok: false, code: "already_paid" };
  const attempt = rows.reduce((max, r) => Math.max(max, Number(r.attempt) || 0), 0) + 1;

  const { data: sub } = await service
    .from("studio_subscriptions")
    .select("monthly_amount_agorot")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  const amountAgorot = Number(sub?.monthly_amount_agorot) > 0 ? Number(sub?.monthly_amount_agorot) : PLATFORM_TEST_AMOUNT_AGOROT;

  const { data: inserted, error: insertError } = await service
    .from("platform_payments")
    .insert({ tenant_id: input.tenantId, period_month: period, attempt, amount_agorot: amountAgorot, status: "pending" })
    .select("id")
    .single();
  if (insertError || !inserted?.id) throw insertError ?? new Error("platform payment not recorded");
  const paymentId = inserted.id as string;

  const { payer, language } = await loadStudioPayer(service, input.tenantId);
  const base = input.returnBaseUrl.replace(/\/+$/, "");
  try {
    const settings = await api.getDocumentSettings().catch(() => ({ DefaultDocumentType: undefined }));
    const documentType = Number(settings.DefaultDocumentType) > 0 ? Number(settings.DefaultDocumentType) : undefined;
    const page = await api.getPaymentPageRedirectUrl(buildPlatformCardOrder({
      paymentId,
      amountAgorot,
      language,
      payer,
      documentType,
      ipnUrl: platformBillingIpnUrl(),
      successUrl: `${base}/admin/setup/payments?plan_card=done`,
      cancelUrl: `${base}/admin/setup/payments?plan_card=cancelled`,
    }));
    await service.from("platform_payments").update({ takbull_order_ref: page.uniqId, updated_at: new Date().toISOString() }).eq("id", paymentId);
    return { ok: true, url: takbullPaymentPageUrl(page.uniqId), paymentId, amountAgorot };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "Takbull error";
    await service
      .from("platform_payments")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", paymentId);
    return { ok: false, code: "takbull_error", message };
  }
}

export type PlatformIpnResult =
  | { status: "succeeded" | "failed"; paymentId: string; duplicate: boolean }
  | { status: "pending" | "amount_mismatch"; paymentId: string }
  | { status: "unverified"; paymentId: string; reason: string }
  | { status: "unknown_order" };

interface PlatformPaymentRow {
  id: string;
  tenant_id: string;
  period_month: string;
  amount_agorot: number;
  status: string;
  takbull_order_ref: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadPlatformPayment(service: SupabaseClient, ipn: TakbullIpn): Promise<PlatformPaymentRow | null> {
  const cols = "id, tenant_id, period_month, amount_agorot, status, takbull_order_ref";
  const ref = ipn.orderReference?.startsWith(PLATFORM_ORDER_PREFIX) ? ipn.orderReference.slice(PLATFORM_ORDER_PREFIX.length) : null;
  if (ref && UUID.test(ref)) {
    const { data } = await service.from("platform_payments").select(cols).eq("id", ref).maybeSingle();
    if (data) return data as PlatformPaymentRow;
  }
  if (ipn.uniqId) {
    const { data } = await service.from("platform_payments").select(cols).eq("takbull_order_ref", ipn.uniqId).maybeSingle();
    if (data) return data as PlatformPaymentRow;
  }
  return null;
}

/**
 * The platform-billing-ipn handler. The notice only names the order: Takbull's own answers
 * (ValidateNotification + GetTransaction, with OpalSwift's keys) and our amount decide, as for
 * a studio's payments. On success the card is saved for the monthly charge and the next charge
 * is the first of the next month. Idempotent: a settled row changes nothing.
 */
export async function processPlatformBillingIpn(
  service: SupabaseClient,
  ipn: TakbullIpn,
  deps: { api?: TakbullApi; now?: () => Date } = {},
): Promise<PlatformIpnResult> {
  const row = await loadPlatformPayment(service, ipn);
  if (!row) return { status: "unknown_order" };
  if (row.status === "succeeded") return { status: "succeeded", paymentId: row.id, duplicate: true };
  if (row.status !== "pending") return { status: "failed", paymentId: row.id, duplicate: true };

  const uniqId = row.takbull_order_ref ?? ipn.uniqId;
  if (!uniqId) return { status: "unverified", paymentId: row.id, reason: "no order" };
  if (ipn.uniqId && row.takbull_order_ref && ipn.uniqId !== row.takbull_order_ref) {
    return { status: "unverified", paymentId: row.id, reason: "order id mismatch" };
  }

  const api = deps.api ?? (await takbullApiForPlatform(service));
  const validation = await api.validateNotification(uniqId);
  const transaction = ipn.transactionInternalNumber ? await api.getTransaction(ipn.transactionInternalNumber) : null;
  const outcome = takbullOutcome({ expectedMinor: row.amount_agorot, validation, transaction });
  const nowIso = (deps.now ?? (() => new Date()))().toISOString();

  if (outcome === "unverified") {
    return { status: "unverified", paymentId: row.id, reason: validation.internalDescription ?? "not confirmed" };
  }
  if (outcome === "pending") return { status: "pending", paymentId: row.id };
  if (outcome === "amount_mismatch") {
    await service
      .from("platform_payments")
      .update({ error_code: "amount_mismatch", updated_at: nowIso })
      .eq("id", row.id);
    return { status: "amount_mismatch", paymentId: row.id };
  }
  if (outcome === "failed") {
    await service
      .from("platform_payments")
      .update({
        status: "failed",
        error_code: ipn.statusCode != null ? String(ipn.statusCode) : null,
        error_message: ipn.statusDescription?.slice(0, 300) ?? null,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", "pending");
    return { status: "failed", paymentId: row.id, duplicate: false };
  }

  const tx = transaction as TakbullTransaction;
  const { data: upgraded, error } = await service
    .from("platform_payments")
    .update({
      status: "succeeded",
      takbull_transaction_id: ipn.transactionInternalNumber,
      document_url: tx.invoiceUniqId ?? null,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!upgraded) return { status: "succeeded", paymentId: row.id, duplicate: true };

  if (tx.cardToken) {
    const { error: saveError } = await service.rpc("save_studio_card_token", {
      p_tenant_id: row.tenant_id,
      p_token: tx.cardToken,
      p_last4: tx.last4DigitsCardNumber ?? null,
      p_expiry: cardExpiry(tx),
      p_next_charge_on: nextMonth(row.period_month),
    });
    if (saveError) throw saveError;
  }
  return { status: "succeeded", paymentId: row.id, duplicate: false };
}

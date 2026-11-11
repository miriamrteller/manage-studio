import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { TakbullApiError, type TakbullApi, type TakbullChargeTokenRequest } from "./client.ts";
import { takbullApiForPlatform } from "./index.ts";
import {
  loadStudioPayer,
  nextMonth,
  PLATFORM_ORDER_PREFIX,
  PLATFORM_TEST_AMOUNT_AGOROT,
  platformBillingIpnUrl,
  type StudioPayer,
} from "./platform-billing.ts";

/**
 * OpalSwift's own billing of studios, step B3 (docs/plans/TAKBULL-INTEGRATION.md): the monthly
 * charge on each studio's saved card, with ChargeToken on OpalSwift's own Takbull account.
 *
 * - Due: a saved card and a next charge date of today or earlier. Retries after a decline on
 *   days 3 and 7 from that date, then no more until the studio adds a new card. The studio
 *   keeps working (owner decision: banner only).
 * - Never two charges for one month: a month with a successful charge is not charged again,
 *   and a charge whose answer we didn't get (network, timeout) stays pending and blocks that
 *   month until it is checked, rather than risk a second charge.
 * - Founders pay nothing before 2027-01-01; nobody is charged before their free_until date.
 * - Only when the platform owner has switched charging on (platform_billing_settings).
 * - Success is ChargeToken's own answer (internalCode 0, order not failed). ChargeToken gives
 *   Takbull's order number, not a transaction number, so there is nothing for GetTransaction.
 */

/** Days after the due date for attempt 1, 2 and 3. */
export const RETRY_DAYS = [0, 3, 7] as const;
/** Founders are free until the end of 2026 (owner decision). */
export const FOUNDER_FREE_UNTIL = "2027-01-01";
/** Takbull order statuses that mean the charge did not happen (failed, cancelled, removed, abandoned). */
const FAILED_ORDER_STATUSES = new Set([1, 5, 7, 9]);

export interface DueSubscription {
  tenant_id: string;
  monthly_amount_agorot: number | null;
  founder: boolean | null;
  free_until: string | null;
  next_charge_on: string | null;
  failed_attempts: number | null;
}

/** Pure: "YYYY-MM-DD" plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Pure: the first of the month a date falls in. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Pure: today in Israel, as "YYYY-MM-DD". */
export function israelToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Pure: when this studio's next attempt is due, or null when it has used its three tries. */
export function nextAttemptOn(sub: Pick<DueSubscription, "next_charge_on" | "failed_attempts">): string | null {
  if (!sub.next_charge_on) return null;
  const offset = RETRY_DAYS[Math.max(0, Number(sub.failed_attempts) || 0)];
  return offset === undefined ? null : addDays(sub.next_charge_on, offset);
}

/** Pure: why this studio is not charged today, or null when it is. */
export function skipReason(sub: DueSubscription, today: string, force = false): SkipReason | null {
  if (!sub.next_charge_on) return "no_date";
  if (sub.founder && today < FOUNDER_FREE_UNTIL) return "founder";
  if (sub.free_until && today < sub.free_until) return "free";
  if (force) return null;
  const on = nextAttemptOn(sub);
  if (on === null) return "out_of_retries";
  return on <= today ? null : "not_due";
}

/** Pure: the ChargeToken request: our payment id as the order, OpalSwift's receipt with it. */
export function buildPlatformTokenCharge(input: {
  paymentId: string;
  amountAgorot: number;
  language: "he" | "en";
  payer: StudioPayer;
  documentType?: number;
  ipnUrl: string;
  token: string;
}): TakbullChargeTokenRequest {
  const total = input.amountAgorot / 100;
  const line = input.language === "he" ? "מנוי OpalSwift" : "OpalSwift plan";
  return {
    order_reference: `${PLATFORM_ORDER_PREFIX}${input.paymentId}`,
    OrderTotalSum: total,
    IPNAddress: input.ipnUrl,
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
    CreditCard: { CardExternalToken: input.token },
  };
}

export type SkipReason =
  | "no_date"
  | "founder"
  | "free"
  | "not_due"
  | "out_of_retries"
  | "already_paid"
  | "pending"
  | "claimed"
  | "no_card";

export type StudioOutcome =
  | { tenantId: string; result: "succeeded"; paymentId: string; period: string }
  | { tenantId: string; result: "declined"; paymentId: string; period: string; nextTryOn: string | null }
  | { tenantId: string; result: "error" | "unclear"; paymentId: string; period: string; message: string }
  | { tenantId: string; result: "skipped"; reason: SkipReason };

export type RunResult =
  | { ok: true; studios: StudioOutcome[] }
  | { ok: false; code: "charging_off" | "not_set_up" };

export interface DeclineEmail {
  tenantId: string;
  amountAgorot: number;
  nextTryOn: string | null;
}

interface Deps {
  api?: TakbullApi;
  now?: () => Date;
  /** Tells the studio's admins a charge was declined (the run carries on if it fails). */
  notifyDeclined?: (email: DeclineEmail) => Promise<void>;
}

/**
 * The daily run (cron), or one studio now (the platform owner's "Charge now" on the dev
 * website: `tenantId` and `force` skip the date and the retry schedule, nothing else).
 */
export async function runPlatformBilling(
  service: SupabaseClient,
  opts: { tenantId?: string; force?: boolean } = {},
  deps: Deps = {},
): Promise<RunResult> {
  const { data: settings } = await service.from("platform_billing_settings").select("charging_enabled").maybeSingle();
  if (settings?.charging_enabled !== true) return { ok: false, code: "charging_off" };

  let api: TakbullApi;
  try {
    api = deps.api ?? (await takbullApiForPlatform(service));
  } catch {
    return { ok: false, code: "not_set_up" };
  }

  const now = deps.now ?? (() => new Date());
  const today = israelToday(now());
  let query = service
    .from("studio_subscriptions")
    .select("tenant_id, monthly_amount_agorot, founder, free_until, next_charge_on, failed_attempts")
    .not("card_token_enc", "is", null);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  else query = query.lte("next_charge_on", today);
  const { data: subs, error } = await query;
  if (error) throw error;

  let documentType: number | undefined | null = null;
  const studios: StudioOutcome[] = [];
  for (const sub of (subs ?? []) as DueSubscription[]) {
    const reason = skipReason(sub, today, opts.force === true && !!opts.tenantId);
    if (reason) {
      studios.push({ tenantId: sub.tenant_id, result: "skipped", reason });
      continue;
    }
    if (documentType === null) {
      const s = await api.getDocumentSettings().catch(() => ({ DefaultDocumentType: undefined }));
      documentType = Number(s.DefaultDocumentType) > 0 ? Number(s.DefaultDocumentType) : undefined;
    }
    studios.push(await chargeStudio(service, api, sub, { now, documentType, notifyDeclined: deps.notifyDeclined }));
  }
  return { ok: true, studios };
}

async function chargeStudio(
  service: SupabaseClient,
  api: TakbullApi,
  sub: DueSubscription,
  ctx: { now: () => Date; documentType?: number; notifyDeclined?: Deps["notifyDeclined"] },
): Promise<StudioOutcome> {
  const tenantId = sub.tenant_id;
  const period = monthOf(sub.next_charge_on as string);
  const stamp = () => ctx.now().toISOString();

  const { data: attempts } = await service
    .from("platform_payments")
    .select("attempt, status, error_code, created_at")
    .eq("tenant_id", tenantId)
    .eq("period_month", period);
  const rows = (attempts ?? []) as Array<{ attempt: number; status: string; error_code: string | null; created_at: string | null }>;
  if (rows.some((r) => r.status === "succeeded")) {
    // Paid already (for example on the "Add a card" page): just move on to the next month.
    await service
      .from("studio_subscriptions")
      .update({ next_charge_on: nextMonth(period), failed_attempts: 0, last_failed_at: null, updated_at: stamp() })
      .eq("tenant_id", tenantId);
    return { tenantId, result: "skipped", reason: "already_paid" };
  }
  // A charge with no answer yet blocks the month (it may have gone through), and so does one
  // started in the last hour (another run). An "Add a card" page left unpaid does not.
  const hourAgo = ctx.now().getTime() - 3_600_000;
  const blocking = rows.some((r) =>
    r.status === "pending" && (r.error_code === "no_answer" || (r.created_at != null && Date.parse(r.created_at) > hourAgo))
  );
  if (blocking) return { tenantId, result: "skipped", reason: "pending" };

  const { data: token } = await service.rpc("get_studio_card_token", { p_tenant_id: tenantId });
  if (typeof token !== "string" || !token) return { tenantId, result: "skipped", reason: "no_card" };

  const amountAgorot = Number(sub.monthly_amount_agorot) > 0 ? Number(sub.monthly_amount_agorot) : PLATFORM_TEST_AMOUNT_AGOROT;
  const attempt = rows.reduce((max, r) => Math.max(max, Number(r.attempt) || 0), 0) + 1;
  // The unique (studio, month, attempt) key: a run that overlaps this one can't claim it too.
  const { data: inserted, error: insertError } = await service
    .from("platform_payments")
    .insert({ tenant_id: tenantId, period_month: period, attempt, amount_agorot: amountAgorot, status: "pending" })
    .select("id")
    .single();
  if (insertError || !inserted?.id) return { tenantId, result: "skipped", reason: "claimed" };
  const paymentId = inserted.id as string;

  const { payer, language } = await loadStudioPayer(service, tenantId);
  const request = buildPlatformTokenCharge({
    paymentId,
    amountAgorot,
    language,
    payer,
    documentType: ctx.documentType,
    ipnUrl: platformBillingIpnUrl(),
    token,
  });

  let answer: Awaited<ReturnType<TakbullApi["chargeToken"]>>;
  try {
    answer = await api.chargeToken(request);
  } catch (err) {
    const message = (err instanceof Error ? err.message : "Takbull error").slice(0, 300);
    const details = err instanceof TakbullApiError ? err.details : null;
    if (details?.code != null) return await declined(String(details.code), message);
    if (details?.httpStatus && details.httpStatus < 500 && details.httpStatus !== 429) {
      // Takbull refused the request itself: nothing was charged, and the card is not to blame.
      await service
        .from("platform_payments")
        .update({ status: "failed", error_code: `http_${details.httpStatus}`, error_message: message, updated_at: stamp() })
        .eq("id", paymentId);
      return { tenantId, result: "error", paymentId, period, message };
    }
    // No answer: the charge may or may not have happened. Keep it pending so it isn't repeated.
    await service
      .from("platform_payments")
      .update({ error_code: "no_answer", error_message: message, updated_at: stamp() })
      .eq("id", paymentId);
    return { tenantId, result: "unclear", paymentId, period, message };
  }

  const orderStatus = Number(answer.orderStatus);
  if (FAILED_ORDER_STATUSES.has(orderStatus)) {
    return await declined(`order_${orderStatus}`, answer.internalDescription ?? "declined");
  }

  const orderId = (answer as { orderId?: number | string }).orderId;
  await service
    .from("platform_payments")
    .update({
      status: "succeeded",
      takbull_order_ref: orderId != null ? String(orderId) : null,
      updated_at: stamp(),
    })
    .eq("id", paymentId)
    .eq("status", "pending");
  await service
    .from("studio_subscriptions")
    .update({ next_charge_on: nextMonth(period), failed_attempts: 0, last_failed_at: null, updated_at: stamp() })
    .eq("tenant_id", tenantId);
  return { tenantId, result: "succeeded", paymentId, period };

  async function declined(code: string, message: string): Promise<StudioOutcome> {
    await service
      .from("platform_payments")
      .update({ status: "failed", error_code: code.slice(0, 40), error_message: message.slice(0, 300), updated_at: stamp() })
      .eq("id", paymentId);
    const failed = (Number(sub.failed_attempts) || 0) + 1;
    await service
      .from("studio_subscriptions")
      .update({ failed_attempts: failed, last_failed_at: stamp(), updated_at: stamp() })
      .eq("tenant_id", tenantId);
    const nextTryOn = nextAttemptOn({ next_charge_on: sub.next_charge_on, failed_attempts: failed });
    if (ctx.notifyDeclined) {
      await ctx.notifyDeclined({ tenantId, amountAgorot, nextTryOn }).catch((e) => {
        console.error("platform billing: decline email not sent", e instanceof Error ? e.message : e);
      });
    }
    return { tenantId, result: "declined", paymentId, period, nextTryOn };
  }
}

/** Pure: the decline email, in the admin's language. */
export function declineEmail(input: { language: "he" | "en"; studioName: string; amountAgorot: number; nextTryOn: string | null; settingsUrl: string }) {
  const amount = `₪${(input.amountAgorot / 100).toFixed(2).replace(/\.00$/, "")}`;
  const date = input.nextTryOn ? input.nextTryOn.split("-").reverse().join("/") : null;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  if (input.language === "he") {
    const subject = "לא הצלחנו לחייב את הכרטיס עבור מנוי OpalSwift";
    const lines = [
      `שלום, לא הצלחנו לחייב את הכרטיס השמור של ${input.studioName} בסך ${amount} עבור מנוי OpalSwift החודשי.`,
      date ? `ננסה שוב ב-${date}.` : "לא ננסה שוב עד שיתווסף כרטיס חדש.",
      "האתר שלכם ממשיך לעבוד כרגיל. אפשר להוסיף כרטיס חדש בהגדרות ← תשלומים.",
    ];
    return { subject, html: emailHtml(lines.map(esc), input.settingsUrl, "לעדכון הכרטיס", "rtl") };
  }
  const subject = "We couldn't charge your card for your OpalSwift plan";
  const lines = [
    `Hello, we couldn't charge ${input.studioName}'s saved card ${amount} for this month's OpalSwift plan.`,
    date ? `We'll try again on ${date}.` : "We won't try again until a new card is added.",
    "Your site keeps working as usual. You can add a new card in Settings → Payments.",
  ];
  return { subject, html: emailHtml(lines.map(esc), input.settingsUrl, "Update your card", "ltr") };
}

function emailHtml(lines: string[], url: string, button: string, dir: "rtl" | "ltr"): string {
  const href = url.replace(/"/g, "&quot;");
  return `<!doctype html><html dir="${dir}"><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">`
    + lines.map((l) => `<p>${l}</p>`).join("")
    + `<p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px">${button}</a></p>`
    + `</body></html>`;
}

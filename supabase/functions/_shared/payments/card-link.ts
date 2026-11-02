import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { ChargeParams, ChargeResult } from "./types.ts";
import { buildChargeMetadata } from "./providers/mock.ts";
import { resolveMonthAmount } from "./month-amount.ts";

/**
 * Card link (payments B b): an admin sends a parent a link to add a card to an ACTIVE
 * enrolment's monthly plan. The link is the provider's hosted page for the month that is due,
 * with "save this card" on; when it is paid, that month is settled as a renewal and the card
 * is saved, so later months are charged to it by the monthly run.
 *
 * Only Grow can do this today. YPay has no saved cards, and Invoice4U saves a card but cannot
 * charge it yet (token charging is not live), so for both the button is hidden.
 */
export const CARD_LINK_PROVIDERS = ["grow"] as const;

export function cardLinkSupported(paymentProvider: string | null | undefined): boolean {
  return (CARD_LINK_PROVIDERS as readonly string[]).includes(paymentProvider ?? "");
}

/** One link per plan and month: sending again reuses the same pending payment. */
export function cardLinkRef(scheduleId: string, period: string): string {
  return `cardlink_${scheduleId}_${period}`;
}

/**
 * The month a card-link payment pays (from its reference), so settling it moves the plan past
 * that month even when the parent pays early; otherwise the monthly run would charge the same
 * month again to the new card. Null for any other payment.
 */
export function cardLinkPeriod(providerPaymentRef: string | null | undefined): string | null {
  const match = /^cardlink_[0-9a-f-]{36}_(\d{4}-\d{2})$/.exec(providerPaymentRef ?? "");
  return match ? match[1] : null;
}

export interface CardLinkDeps {
  createCharge(params: ChargeParams): Promise<ChargeResult>;
  priceMinor(offeringPriceMinor: number): number;
}

export type CardLinkResult =
  | {
    ok: true;
    pageUrl: string;
    period: string;
    amountMinor: number;
    currency: string;
    personId: string;
    offeringId: string;
  }
  | { ok: false; status: number; code: string; error: string };

const OPEN_SCHEDULE_STATUSES = ["active", "paused", "suspended"];

export async function createCardLinkCharge(
  service: SupabaseClient,
  input: { tenantId: string; engagementId: string },
  deps: CardLinkDeps,
): Promise<CardLinkResult> {
  const { data: tenant } = await service
    .from("tenants")
    .select("id, currency, payment_provider")
    .eq("id", input.tenantId)
    .single();
  if (!tenant) return { ok: false, status: 404, code: "not_found", error: "Tenant not found" };
  if (!cardLinkSupported(tenant.payment_provider as string | null)) {
    return {
      ok: false,
      status: 409,
      code: "card_link_unsupported",
      error: "Saving a card is not available with this payment provider",
    };
  }

  const { data: engagement } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, billing_account_id, status")
    .eq("id", input.engagementId)
    .single();
  if (!engagement || engagement.tenant_id !== input.tenantId) {
    return { ok: false, status: 404, code: "not_found", error: "Engagement not found" };
  }
  if (engagement.status !== "active") {
    return { ok: false, status: 409, code: "not_active", error: "The enrolment is not active" };
  }

  const { data: schedule } = await service
    .from("billing_schedules")
    .select("id, tenant_id, billing_account_id, next_billing_date, status")
    .eq("engagement_id", input.engagementId)
    .maybeSingle();
  if (!schedule || schedule.tenant_id !== input.tenantId ||
    !OPEN_SCHEDULE_STATUSES.includes(schedule.status as string)) {
    return { ok: false, status: 409, code: "no_monthly_plan", error: "This enrolment has no monthly plan" };
  }

  const billingAccountId = (schedule.billing_account_id as string | null) ??
    (engagement.billing_account_id as string | null);
  if (!billingAccountId) {
    return { ok: false, status: 400, code: "no_billing_account", error: "Engagement missing billing account" };
  }

  const { data: card } = await service
    .from("payment_method_tokens")
    .select("id")
    .eq("billing_account_id", billingAccountId)
    .eq("provider", tenant.payment_provider as string)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (card) {
    return { ok: false, status: 409, code: "card_already_saved", error: "A card is already saved for this enrolment" };
  }

  const { data: offering } = await service
    .from("offerings")
    .select("price_minor, currency")
    .eq("id", engagement.offering_id)
    .single();
  if (!offering) return { ok: false, status: 404, code: "not_found", error: "Offering not found" };

  const period = (schedule.next_billing_date as string).slice(0, 7);
  const { amountMinor } = await resolveMonthAmount(service, {
    scheduleId: schedule.id as string,
    period,
    classPriceMinor: deps.priceMinor(offering.price_minor as number),
  });
  const currency = ((offering.currency as string | null) ?? (tenant.currency as string | null) ?? "ILS")
    .toUpperCase();

  const metadata = {
    ...buildChargeMetadata({
      tenantId: input.tenantId,
      engagementId: engagement.id as string,
      billingAccountId,
      offeringId: engagement.offering_id as string,
      personId: engagement.person_id as string,
      vatRate: 0,
      pretaxMinor: 0,
      vatMinor: 0,
      totalMinor: amountMinor,
      chargeType: "renewal",
      billingScheduleId: schedule.id as string,
    }),
    save_card: "1" as const,
  };

  const charge = await deps.createCharge({
    amountMinor,
    currency,
    idempotencyKey: cardLinkRef(schedule.id as string, period),
    metadata,
    saveCard: true,
  });
  if (!charge.pageUrl) {
    return { ok: false, status: 502, code: "no_page", error: "The payment provider returned no payment page" };
  }

  return {
    ok: true,
    pageUrl: charge.pageUrl,
    period,
    amountMinor,
    currency,
    personId: engagement.person_id as string,
    offeringId: engagement.offering_id as string,
  };
}

/** Email wording for the card link (en + he). `month` is already formatted, e.g. "December 2026". */
export function buildCardLinkEmailCopy(input: {
  language: "en" | "he";
  studentName: string;
  className: string;
  month: string;
}): { subject: string; intro: string; ctaButton: string; description: string } {
  const { language, studentName, className, month } = input;
  if (language === "he") {
    return {
      subject: `הוספת כרטיס לתשלום החודשי — ${className}`,
      intro: `כדי לשלם על ${className} של ${studentName} בכרטיס בכל חודש, שלמו כאן על ${month}. ` +
        "הכרטיס יישמר, והחודשים הבאים יחויבו בו אוטומטית.",
      ctaButton: "תשלום ושמירת הכרטיס",
      description: `${studentName} — ${className}, ${month}`,
    };
  }
  return {
    subject: `Add a card for monthly payments — ${className}`,
    intro: `To pay for ${studentName}'s ${className} by card each month, pay for ${month} here. ` +
      "Your card will be saved and the following months will be charged to it automatically.",
    ctaButton: "Pay and save card",
    description: `${studentName} — ${className}, ${month}`,
  };
}

/** "2026-12" → "December 2026" / "דצמבר 2026". */
export function formatCardLinkMonth(period: string, language: "en" | "he"): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(language === "he" ? "he-IL" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

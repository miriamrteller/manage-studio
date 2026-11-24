import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import {
  computeTermPrice,
  parseTermPriceSnapshot,
  termClassDates,
  type PayPlan,
  type TermPrice,
  type TermPriceSnapshot,
  type TermPricingRules,
} from "../email-dist/termPricing.js";
import { isSkippedHolidayIsoDate } from "../holidays.ts";
import { parseClassReminders } from "../class-reminders.ts";

/**
 * Term pricing loader (owner decision, 24 Nov 2026): gathers what packages/shared termPricing
 * needs for one enrolment. Null = the class is not term-priced (no price per class, no weekday
 * or no season), so the old monthly price applies unchanged.
 */

const DEFAULT_RULES: TermPricingRules = {
  upfront_discount_pct: 0,
  round_minor: 500,
  early_enrol_by: null,
  early_until: null,
  sibling_discount_pct: 0,
  sibling_from: 2,
};

/** Statuses that count as "enrolled" this term (sisters); a withdrawn one still counts for the early price. */
const ENROLLED_STATUSES = ["active", "pending_payment", "pending_waiver"];

/** YYYY-MM-DD in Israel for an instant. */
export function israelDate(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export interface LoadedTermPrice {
  price: TermPrice;
  trialPaymentId: string | null;
}

export async function loadTermPrice(
  service: SupabaseClient,
  engagementId: string,
  now: Date = new Date(),
): Promise<LoadedTermPrice | null> {
  const { data: engagement } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, season_id, created_at")
    .eq("id", engagementId)
    .maybeSingle();
  if (!engagement) return null;
  const tenantId = engagement.tenant_id as string;

  const { data: offering } = await service
    .from("offerings")
    .select("price_per_class_minor, early_price_per_class_minor, day_of_week, season_id")
    .eq("id", engagement.offering_id)
    .maybeSingle();
  const pricePerClass = (offering?.price_per_class_minor as number | null | undefined) ?? null;
  const dayOfWeek = (offering?.day_of_week as number | null | undefined) ?? null;
  const seasonId = (engagement.season_id as string | null) ?? (offering?.season_id as string | null) ?? null;
  if (!pricePerClass || dayOfWeek === null || !seasonId) return null;

  const [{ data: season }, { data: tenant }, { data: rulesRow }, { data: person }] = await Promise.all([
    service.from("seasons").select("start_date, end_date").eq("id", seasonId).maybeSingle(),
    service.from("tenants").select("class_reminders").eq("id", tenantId).maybeSingle(),
    service
      .from("tenant_term_pricing")
      .select(
        "upfront_discount_pct, round_minor, early_enrol_by, early_until, sibling_discount_pct, sibling_from, trial_offering_id",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    service.from("people").select("account_id").eq("id", engagement.person_id).maybeSingle(),
  ]);
  if (!season) return null;

  const closed = new Set(parseClassReminders(tenant?.class_reminders).closed_dates);
  const classDates = termClassDates({
    dayOfWeek,
    termStart: season.start_date as string,
    termEnd: season.end_date as string,
    from: israelDate(now),
    isOff: (d) => closed.has(d) || isSkippedHolidayIsoDate(d),
  });

  const rules: TermPricingRules = rulesRow
    ? {
        upfront_discount_pct: Number(rulesRow.upfront_discount_pct) || 0,
        round_minor: Number(rulesRow.round_minor) || 500,
        early_enrol_by: (rulesRow.early_enrol_by as string | null) ?? null,
        early_until: (rulesRow.early_until as string | null) ?? null,
        sibling_discount_pct: Number(rulesRow.sibling_discount_pct) || 0,
        sibling_from: Number(rulesRow.sibling_from) || 2,
      }
    : DEFAULT_RULES;

  // The family: everyone on the same family account, else just this person. Sisters are the
  // account's children (not the parent or an adult student enrolled on the same account).
  let familyIds = [engagement.person_id as string];
  let childIds = new Set<string>([engagement.person_id as string]);
  const accountId = (person?.account_id as string | null) ?? null;
  if (accountId) {
    const { data: members } = await service
      .from("account_members")
      .select("person_id, role")
      .eq("account_id", accountId);
    const all = (members ?? []).map((m) => m.person_id as string);
    if (all.length > 0) familyIds = [...new Set([...all, engagement.person_id as string])];
    const children = (members ?? [])
      .filter((m) => m.role === "member" || m.role === "sibling")
      .map((m) => m.person_id as string);
    childIds = new Set(children);
  }

  const { data: familyEngagements } = await service
    .from("engagements")
    .select("id, person_id, season_id, offering_id, created_at, status")
    .eq("tenant_id", tenantId)
    .in("person_id", familyIds)
    .in("status", [...ENROLLED_STATUSES, "withdrawn"]);
  const rows = [...(familyEngagements ?? [])];
  if (!rows.some((r) => r.id === engagement.id)) {
    rows.push({ ...engagement, status: "pending_payment" });
  }

  // Early price: when the family first enrolled (an earlier term counts too).
  const familyFirstEnrolledOn = rows
    .map((r) => israelDate(r.created_at as string))
    .sort()[0] ?? null;

  // Sisters: each girl's first enrolment this term, in order; this girl's place in it.
  const firstThisTerm = new Map<string, string>();
  for (const r of rows) {
    if (((r.season_id as string | null) ?? seasonId) !== seasonId) continue;
    if (r.status === "withdrawn" || !childIds.has(r.person_id as string)) continue;
    const pid = r.person_id as string;
    const at = r.created_at as string;
    const seen = firstThisTerm.get(pid);
    if (!seen || at < seen) firstThisTerm.set(pid, at);
  }
  const order = [...firstThisTerm.entries()].sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1].localeCompare(b[1])));
  const sisterPosition = childIds.has(engagement.person_id as string)
    ? Math.max(1, order.findIndex(([pid]) => pid === engagement.person_id) + 1)
    : 1;

  // A paid trial class, not yet taken off another enrolment of the same girl.
  let trialCreditMinor = 0;
  let trialPaymentId: string | null = null;
  const trialOfferingId = (rulesRow?.trial_offering_id as string | null | undefined) ?? null;
  if (trialOfferingId) {
    const { data: trials } = await service
      .from("payments")
      .select("id, total_amount_minor")
      .eq("tenant_id", tenantId)
      .eq("person_id", engagement.person_id)
      .eq("offering_id", trialOfferingId)
      .eq("status", "succeeded")
      .order("paid_at", { ascending: false });
    if (trials && trials.length > 0) {
      const { data: others } = await service
        .from("engagements")
        .select("id, term_price")
        .eq("tenant_id", tenantId)
        .eq("person_id", engagement.person_id)
        .neq("id", engagement.id)
        .not("term_price", "is", null);
      const used = new Set(
        (others ?? [])
          .map((o) => parseTermPriceSnapshot(o.term_price)?.trialPaymentId ?? null)
          .filter((id): id is string => !!id),
      );
      const trial = trials.find((t) => !used.has(t.id as string));
      if (trial) {
        trialPaymentId = trial.id as string;
        trialCreditMinor = Number(trial.total_amount_minor) || 0;
      }
    }
  }

  const price = computeTermPrice({
    rules,
    pricePerClassMinor: pricePerClass,
    earlyPricePerClassMinor: (offering?.early_price_per_class_minor as number | null | undefined) ?? null,
    classDates,
    familyFirstEnrolledOn,
    sisterPosition,
    trialCreditMinor,
  });
  return price ? { price, trialPaymentId } : null;
}

/** The plan the family picked (or monthly), with the price shown, saved on the enrolment. */
export async function saveTermPlan(
  service: SupabaseClient,
  engagementId: string,
  loaded: LoadedTermPrice,
  plan: PayPlan,
): Promise<TermPriceSnapshot> {
  const snapshot: TermPriceSnapshot = { ...loaded.price, plan, trialPaymentId: loaded.trialPaymentId };
  await service
    .from("engagements")
    .update({ pay_plan: plan, term_price: snapshot })
    .eq("id", engagementId)
    .eq("status", "pending_payment");
  return snapshot;
}

/** The saved snapshot of an enrolment, if it is term-priced. */
export async function savedTermPrice(
  service: SupabaseClient,
  engagementId: string,
): Promise<TermPriceSnapshot | null> {
  const { data } = await service
    .from("engagements")
    .select("term_price")
    .eq("id", engagementId)
    .maybeSingle();
  return parseTermPriceSnapshot(data?.term_price);
}

/** YYYY-MM-01 of the month after `period` (YYYY-MM). */
export function monthAfter(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** The reason shown to the studio beside the monthly amount, e.g. "Term: 17 classes × ₪60, early price, sister 10% off". */
export function termAmountNote(t: TermPriceSnapshot): string {
  const parts = [`Term: ${t.classCount} classes × ${(t.perClassMinor / 100).toFixed(t.perClassMinor % 100 ? 2 : 0)}`];
  if (t.early) parts.push("early enrolment price");
  if (t.sisterPct > 0) parts.push(`sister ${t.sisterPct}% off`);
  parts.push(`${t.months.length} monthly payments`);
  return parts.join(", ");
}

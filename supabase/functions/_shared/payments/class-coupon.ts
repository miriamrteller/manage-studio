import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { ClassCouponResult } from "../checkout-bootstrap-types.ts";

/**
 * Coupon codes (class_discount_coupons; the name is historical, they work on every
 * sale). A client types a code at checkout: public.apply_class_coupon puts it on an
 * enrolment or booking, public.apply_request_coupon on a payment request (/pay).
 * A bad code never stops payment: the client sees why and pays the full price.
 */
export type { ClassCouponResult };
type ClassCouponReason = Extract<ClassCouponResult, { ok: false }>["reason"];

const REASONS: readonly string[] = ["not_found", "expired", "used_up", "at_maximum", "not_payable", "not_class"];

/** Pure: the database function's answer as a result. */
export function parseClassCouponResult(raw: unknown): ClassCouponResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "error" };
  const r = raw as Record<string, unknown>;
  if (r.ok === true && typeof r.amount_minor === "number") {
    return { ok: true, amountMinor: r.amount_minor, firstOnly: r.first_only === true };
  }
  const reason = typeof r.reason === "string" && REASONS.includes(r.reason) ? r.reason : "error";
  return { ok: false, reason: reason as ClassCouponReason };
}

export async function applyClassCoupon(
  service: SupabaseClient,
  engagementId: string,
  code: string,
): Promise<ClassCouponResult> {
  const { data, error } = await service.rpc("apply_class_coupon", {
    p_engagement_id: engagementId,
    p_code: code.slice(0, 80),
  });
  if (error) {
    console.error("[apply_class_coupon]", error.message);
    return { ok: false, reason: "error" };
  }
  return parseClassCouponResult(data);
}

export async function applyRequestCoupon(
  service: SupabaseClient,
  token: string,
  code: string,
): Promise<ClassCouponResult> {
  const { data, error } = await service.rpc("apply_request_coupon", {
    p_token: token,
    p_code: code.slice(0, 80),
  });
  if (error) {
    console.error("[apply_request_coupon]", error.message);
    return { ok: false, reason: "error" };
  }
  return parseClassCouponResult(data);
}

/** The studio has discounts switched on (feature billing:discounts, on for every studio by default). */
export async function studioDiscountsOn(service: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await service.rpc("get_tenant_features", { p_tenant_id: tenantId });
  // Can't tell: leave discounts on (the database checks again when a code is applied).
  if (error || !Array.isArray(data)) return true;
  return (data as string[]).includes("billing:discounts");
}

/** True when the studio has discounts on and at least one coupon switched on (checkout then offers the code box). */
export async function studioHasClassCoupons(service: SupabaseClient, tenantId: string): Promise<boolean> {
  if (!(await studioDiscountsOn(service, tenantId))) return false;
  const { count, error } = await service
    .from("class_discount_coupons")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("active", true);
  return !error && (count ?? 0) > 0;
}

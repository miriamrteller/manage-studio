import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { ClassCouponResult } from "../checkout-bootstrap-types.ts";

/**
 * Coupon codes for classes (class_discount_coupons). A parent types a code at
 * checkout; public.apply_class_coupon checks it and puts it on the enrolment.
 * A bad code never stops checkout: the parent sees why and pays the full price.
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

/** True when the studio has at least one coupon switched on (checkout then offers the code box). */
export async function studioHasClassCoupons(service: SupabaseClient, tenantId: string): Promise<boolean> {
  const { count, error } = await service
    .from("class_discount_coupons")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("active", true);
  return !error && (count ?? 0) > 0;
}

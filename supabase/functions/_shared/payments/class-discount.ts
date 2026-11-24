import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * Class discounts (sibling, extra class, early bird, a client's own discount and
 * coupon codes). The database works the discount out once, when the enrolment is
 * made (a coupon when the parent types it at checkout), and stores it on the
 * enrolment (engagements.discount_minor / first_discount_minor / discount_lines,
 * migration 20261124140000_class_discounts.sql).
 *
 * discountMinor comes off every charge (every month for a monthly class);
 * firstDiscountMinor (a first-payment coupon) comes off the first payment only.
 */
export type ClassDiscountKind = "sibling" | "extra_class" | "early_bird" | "client" | "coupon";

export interface ClassDiscountLine {
  kind: ClassDiscountKind;
  amountMinor: number;
  /** Off the first payment only (a first-payment coupon). */
  firstOnly?: boolean;
  /** The coupon code, for a coupon line. */
  code?: string;
}

export interface EngagementDiscount {
  discountMinor: number;
  firstDiscountMinor: number;
  lines: ClassDiscountLine[];
}

export const NO_DISCOUNT: EngagementDiscount = { discountMinor: 0, firstDiscountMinor: 0, lines: [] };

const KINDS: readonly string[] = ["sibling", "extra_class", "early_bird", "client", "coupon"];

/** Pure: the stored lines, keeping only well-formed ones. */
export function parseDiscountLines(raw: unknown): ClassDiscountLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: ClassDiscountLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as Record<string, unknown>).kind;
    const amount = (item as Record<string, unknown>).amount_minor;
    if (typeof kind === "string" && KINDS.includes(kind) && typeof amount === "number" && amount > 0) {
      const line: ClassDiscountLine = { kind: kind as ClassDiscountKind, amountMinor: amount };
      if ((item as Record<string, unknown>).first_only === true) line.firstOnly = true;
      const code = (item as Record<string, unknown>).code;
      if (typeof code === "string" && code) line.code = code;
      lines.push(line);
    }
  }
  return lines;
}

type DiscountRow = { discount_minor?: unknown; first_discount_minor?: unknown; discount_lines?: unknown };

function positive(value: unknown): number {
  return typeof value === "number" && value > 0 ? value : 0;
}

/** Pure: the engagement's discount from its row (missing columns = no discount). */
export function engagementDiscountFromRow(row: DiscountRow | null | undefined): EngagementDiscount {
  const discountMinor = positive(row?.discount_minor);
  const firstDiscountMinor = positive(row?.first_discount_minor);
  if (discountMinor === 0 && firstDiscountMinor === 0) return NO_DISCOUNT;
  return { discountMinor, firstDiscountMinor, lines: parseDiscountLines(row?.discount_lines) };
}

/** Pure: what comes off the first payment (the every-charge discount plus a first-payment coupon). */
export function firstPaymentDiscount(discount: EngagementDiscount): number {
  return discount.discountMinor + discount.firstDiscountMinor;
}

/** Pure: true when anything comes off (the first payment or every payment). */
export function hasDiscount(discount: EngagementDiscount): boolean {
  return discount.discountMinor > 0 || discount.firstDiscountMinor > 0;
}

/** Pure: the price after the discount. Never below zero. */
export function priceAfterDiscount(priceMinor: number, discountMinor: number | null | undefined): number {
  const discount = typeof discountMinor === "number" && discountMinor > 0 ? discountMinor : 0;
  return Math.max(0, priceMinor - discount);
}

export async function loadEngagementDiscount(
  service: SupabaseClient,
  engagementId: string,
): Promise<EngagementDiscount> {
  const { data } = await service
    .from("engagements")
    .select("discount_minor, first_discount_minor, discount_lines")
    .eq("id", engagementId)
    .maybeSingle();
  return engagementDiscountFromRow(data as DiscountRow | null);
}

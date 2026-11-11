import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * Automatic class discounts (sibling, extra class, early bird). The database works
 * the discount out once, when the enrolment is made, and stores it on the
 * enrolment (engagements.discount_minor / discount_lines, migration
 * 20261111075000_class_discounts.sql). Every price reader takes the class price
 * minus that amount; for a monthly class it is per month.
 */
export type ClassDiscountKind = "sibling" | "extra_class" | "early_bird";

export interface ClassDiscountLine {
  kind: ClassDiscountKind;
  amountMinor: number;
}

export interface EngagementDiscount {
  discountMinor: number;
  lines: ClassDiscountLine[];
}

export const NO_DISCOUNT: EngagementDiscount = { discountMinor: 0, lines: [] };

const KINDS: readonly string[] = ["sibling", "extra_class", "early_bird"];

/** Pure: the stored lines, keeping only well-formed ones. */
export function parseDiscountLines(raw: unknown): ClassDiscountLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: ClassDiscountLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as Record<string, unknown>).kind;
    const amount = (item as Record<string, unknown>).amount_minor;
    if (typeof kind === "string" && KINDS.includes(kind) && typeof amount === "number" && amount > 0) {
      lines.push({ kind: kind as ClassDiscountKind, amountMinor: amount });
    }
  }
  return lines;
}

/** Pure: the engagement's discount from its row (missing columns = no discount). */
export function engagementDiscountFromRow(
  row: { discount_minor?: unknown; discount_lines?: unknown } | null | undefined,
): EngagementDiscount {
  const discountMinor = typeof row?.discount_minor === "number" && row.discount_minor > 0
    ? row.discount_minor
    : 0;
  if (discountMinor === 0) return NO_DISCOUNT;
  return { discountMinor, lines: parseDiscountLines(row?.discount_lines) };
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
    .select("discount_minor, discount_lines")
    .eq("id", engagementId)
    .maybeSingle();
  return engagementDiscountFromRow(data as { discount_minor?: unknown; discount_lines?: unknown } | null);
}

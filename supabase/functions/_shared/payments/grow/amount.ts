/**
 * Grow (Meshulam) works in major currency units (NIS shekels) with two decimals, while the
 * rest of the system stores money as integer minor units (agorot). These helpers convert
 * between the two without floating-point drift.
 */

/** 100 (agorot) → "1.00"; 12345 → "123.45". */
export function growAmountFromMinor(amountMinor: number): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`amountMinor must be an integer, got ${amountMinor}`);
  }
  return (amountMinor / 100).toFixed(2);
}

/** "1.00" → 100; 123.45 → 12345. Rounds to the nearest agora to absorb float error. */
export function minorFromGrowAmount(sum: string | number): number {
  const value = typeof sum === "number" ? sum : Number(sum);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Grow sum: ${sum}`);
  }
  return Math.round(value * 100);
}

/**
 * Job (shoot) payment helpers shared by the admin panel and the edge functions.
 * Minor units throughout (agorot). Deterministic — no rounding surprises:
 * the deposit is rounded to the nearest whole shekel and the balance absorbs
 * the remainder so deposit + balance === total exactly.
 */

export interface DepositBalanceSplit {
  depositMinor: number;
  balanceMinor: number;
}

/**
 * Split a total into a deposit of `depositPercent` (1–99) and the balance.
 * Deposit rounds to the nearest 100 minor units (whole shekel); balance = rest.
 */
export function splitDepositBalance(totalMinor: number, depositPercent: number): DepositBalanceSplit {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error('splitDepositBalance: totalMinor must be a positive integer');
  }
  if (!Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent >= 100) {
    throw new Error('splitDepositBalance: depositPercent must be between 1 and 99');
  }
  const rawDeposit = (totalMinor * depositPercent) / 100;
  let depositMinor = Math.round(rawDeposit / 100) * 100;
  if (depositMinor <= 0) depositMinor = 100;
  if (depositMinor >= totalMinor) depositMinor = totalMinor - 100;
  if (depositMinor <= 0) {
    // Total under two shekels: no meaningful split — everything is the deposit.
    return { depositMinor: totalMinor, balanceMinor: 0 };
  }
  return { depositMinor, balanceMinor: totalMinor - depositMinor };
}

/** ISO date (YYYY-MM-DD) N days before a date, in the calendar of the given ISO date. */
export function isoDateMinusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return new Date(utc - days * 86_400_000).toISOString().slice(0, 10);
}

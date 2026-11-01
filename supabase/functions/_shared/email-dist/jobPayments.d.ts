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
export declare function splitDepositBalance(totalMinor: number, depositPercent: number): DepositBalanceSplit;
/** ISO date (YYYY-MM-DD) N days before a date, in the calendar of the given ISO date. */
export declare function isoDateMinusDays(isoDate: string, days: number): string;
//# sourceMappingURL=jobPayments.d.ts.map
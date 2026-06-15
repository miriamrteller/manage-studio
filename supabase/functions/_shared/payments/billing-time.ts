/** Jerusalem calendar helpers for billing (Asia/Jerusalem). */
export function nowInJerusalem(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }),
  );
}

export function todayInJerusalem(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function firstOfNextMonthJerusalem(from = nowInJerusalem()): string {
  const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function renewalIdempotencyKey(engagementId: string, periodYm: string): string {
  return `renewal-${engagementId}-${periodYm}`;
}

export function currentPeriodYmJerusalem(): string {
  return todayInJerusalem().slice(0, 7);
}

/** Dunning retry offsets from billing due date: Day 4 (+3d), Day 8 (+4d after Day 4). */
export function dunningNextAttemptAt(attemptCount: number, from = new Date()): string {
  const dayOffsets = [3, 4];
  const offset = dayOffsets[Math.min(attemptCount - 1, dayOffsets.length - 1)] ?? 4;
  return new Date(from.getTime() + offset * 24 * 60 * 60 * 1000).toISOString();
}

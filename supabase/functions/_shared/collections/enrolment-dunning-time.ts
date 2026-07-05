/** Absolute day offsets from engagement.created_at (Jerusalem calendar). */
export const ENROLMENT_DUNNING_DAY_OFFSETS = [3, 7, 14] as const;

function jerusalemYmdFromInstant(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function addCalendarDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** UTC instant for 00:00:00 Asia/Jerusalem on the given YYYY-MM-DD calendar day. */
export function jerusalemMidnightIso(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day - 1, 12, 0, 0);

  for (let i = 0; i < 48 * 60; i++) {
    const instant = new Date(startMs + i * 60 * 1000);
    if (jerusalemYmdFromInstant(instant.toISOString()) !== ymd) continue;

    const prev = new Date(startMs + (i - 1) * 60 * 1000);
    if (i === 0 || jerusalemYmdFromInstant(prev.toISOString()) !== ymd) {
      return instant.toISOString();
    }
  }

  throw new Error(`Could not resolve Jerusalem midnight for ${ymd}`);
}

/** ISO timestamp when attempt N (1|2|3) is due. */
export function enrolmentDunningActionDueAt(
  createdAtIso: string,
  attemptNumber: 1 | 2 | 3,
): string {
  const createdYmd = jerusalemYmdFromInstant(createdAtIso);
  const offset = ENROLMENT_DUNNING_DAY_OFFSETS[attemptNumber - 1];
  const dueYmd = addCalendarDaysToYmd(createdYmd, offset);
  return jerusalemMidnightIso(dueYmd);
}

/** Whole Jerusalem calendar days from created_at date to now (start day = 0). */
export function jerusalemCalendarDaysSinceCreated(
  createdAtIso: string,
  now: Date = new Date(),
): number {
  const startYmd = jerusalemYmdFromInstant(createdAtIso);
  const nowYmd = jerusalemYmdFromInstant(now.toISOString());
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ny, nm, nd] = nowYmd.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ny, nm - 1, nd);
  return Math.floor((end - start) / (24 * 3600 * 1000));
}

/**
 * Highest eligible attempt from SPEC Day 3/7/14 calendar policy (catch-up safe).
 * Returns null when no step is due yet.
 */
export function resolveEnrolmentDunningDueAttempt(
  createdAtIso: string,
  attemptCount: number,
  now: Date = new Date(),
): 1 | 2 | 3 | null {
  const days = jerusalemCalendarDaysSinceCreated(createdAtIso, now);

  if (days >= 14 && attemptCount < 3) return 3;
  if (days >= 7 && attemptCount < 2) return 2;
  if (days >= 3 && attemptCount < 1) return 1;
  return null;
}

/** Next scheduled action after completing attempt N; null after attempt 3. */
export function enrolmentDunningNextActionAt(
  createdAtIso: string,
  completedAttempt: number,
): string | null {
  if (completedAttempt >= 3) return null;
  return enrolmentDunningActionDueAt(
    createdAtIso,
    (completedAttempt + 1) as 1 | 2 | 3,
  );
}

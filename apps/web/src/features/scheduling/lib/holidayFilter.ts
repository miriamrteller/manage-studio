import { isSkippedHolidayInIsrael } from '@shared/lib/holidays';
import type { ScheduleEvent } from '../types';

/**
 * Holiday filtering for the public timetable feed (DL-HOLIDAY-001).
 *
 * `get_public_schedule_events_by_subdomain` returns two kinds of rows:
 * - `event_type: 'class'`   — recurring occurrences generated from `offerings`
 *                             (`generate_series` × `day_of_week`).
 * - `event_type: 'session'` — explicit `offering_sessions` rows. The RPC already
 *                             suppresses the generated occurrence for those dates,
 *                             so a session row is always an admin override.
 *
 * Recurring occurrences on Israeli holidays are dropped; explicit sessions,
 * appointments and blocks are always kept — an admin who books a session on a
 * holiday means it. The Israel civil day of `starts_at` is what gets tested, so the
 * result never depends on the viewer's timezone.
 *
 * "Holiday" here means `SKIP_FLAGS` (Yom Tov, Chol HaMoed, Chanukah, fasts) plus the
 * named studio closures in `ALWAYS_SKIPPED_DESCS` (Purim, Yom HaAtzma'ut) — the same
 * predicate that drives `DayShade.isSkipped` and the holiday export, so the calendar,
 * the timetable and the exported "skipped dates" list can never disagree. Shaded-only
 * days (Rabin Memorial Day, Sigd, Tu BiShvat, Lag BaOmer …) keep their classes; see
 * `@shared/lib/holidays` for how to widen this.
 */
export function filterHolidayOccurrences(events: ScheduleEvent[]): ScheduleEvent[] {
  return events.filter((event) => {
    if (event.event_type !== 'class') return true;
    const startsAt = new Date(event.starts_at);
    if (Number.isNaN(startsAt.getTime())) return true;
    return !isSkippedHolidayInIsrael(startsAt);
  });
}

/**
 * DL-HOLIDAY-001 — Deno-side checks for the get-available-slots holiday filter.
 * Spec test IDs T-20, T-21, T-22.
 *
 * Run: deno test --allow-net supabase/functions/get-available-slots/index.test.ts
 * (CI runs the Vitest mirror in apps/web/src/__tests__/holiday-slot-filter.test.ts;
 * this file exercises the same pure functions under the real Deno + npm: resolution,
 * which is also the cheapest way to verify `npm:@hebcal/core` works in the edge runtime.)
 *
 * T-22 note: the end-to-end override path (offering_sessions row → date stays bookable →
 * RPC returns slots) needs a linked Supabase environment and is therefore a HITL gate.
 * The pure override logic is fully covered here via `filterHolidayDates`.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { filterHolidayDates, isHoliday, isHolidayIsoDate } from "../_shared/holidays.ts";

// T-20: Rosh Hashana 5786 → no slots for that date.
Deno.test("T-20 Rosh Hashana (2025-09-23) is filtered out", () => {
  assertEquals(isHoliday(new Date("2025-09-23")), true);
  assertEquals(isHolidayIsoDate("2025-09-23"), true);
  assertEquals(filterHolidayDates(["2025-09-23"], []), []);
});

// T-21: a regular day keeps its slots.
Deno.test("T-21 a regular day (2024-11-15) is kept", () => {
  assertEquals(isHoliday(new Date("2024-11-15")), false);
  assertEquals(filterHolidayDates(["2024-11-15"], []), ["2024-11-15"]);
});

// T-22: an explicit offering_sessions row overrides the holiday filter.
Deno.test("T-22 explicit offering_session on Chanukah keeps the date bookable", () => {
  const dates = ["2024-12-27", "2024-12-28", "2024-12-29"];
  assertEquals(filterHolidayDates(dates, ["2024-12-28"]), ["2024-12-28"]);
  assertEquals(filterHolidayDates(dates, []), []);
});

Deno.test("Yom Kippur 5786 (2025-10-02) is a holiday, the day after is not", () => {
  assertEquals(isHolidayIsoDate("2025-10-02"), true);
  assertEquals(isHolidayIsoDate("2025-10-03"), false);
});

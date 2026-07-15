/**
 * get-available-slots
 * Composes DB availability (get_available_slots RPC) with Google Calendar free/busy
 * when the tenant is connected. This is the layer where S3c "freebusy inside
 * availability" lives — a SQL function cannot make outbound HTTP calls.
 *
 * Accepts either a single `date` or an inclusive `start_date`/`end_date` range
 * (capped) so the booking calendar can load a visible window in one request.
 *
 * Failure policy: if the tenant is connected but free/busy fails after one retry,
 * we FAIL CLOSED (drop all slots for the window) to minimise double-booking risk.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { freeBusy, getValidAccessToken, type BusyInterval } from "../_shared/google-calendar.ts";

interface Slot {
  starts_at: string;
  ends_at: string;
}

/** Max inclusive days per request — covers a FullCalendar month grid + buffer. */
const MAX_RANGE_DAYS = 62;

function overlaps(slot: Slot, busy: BusyInterval): boolean {
  return new Date(slot.starts_at) < new Date(busy.end) && new Date(slot.ends_at) > new Date(busy.start);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachIsoDate(start: string, end: string): string[] | null {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;
  const days =
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > MAX_RANGE_DAYS) return null;
  const out: string[] = [];
  for (let i = 0; i < days; i += 1) {
    out.push(toIsoDate(addUtcDays(startDate, i)));
  }
  return out;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: {
    subdomain?: string;
    offering_id?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (!body.subdomain || !body.offering_id) {
    return jsonResponse({ error: "subdomain and offering_id are required" }, 400);
  }

  let dates: string[];
  if (body.date) {
    if (!parseIsoDate(body.date)) {
      return jsonResponse({ error: "date must be YYYY-MM-DD" }, 400);
    }
    dates = [body.date];
  } else if (body.start_date && body.end_date) {
    const range = eachIsoDate(body.start_date, body.end_date);
    if (!range) {
      return jsonResponse(
        { error: `start_date/end_date must be YYYY-MM-DD, start ≤ end, and at most ${MAX_RANGE_DAYS} days` },
        400,
      );
    }
    dates = range;
  } else {
    return jsonResponse({ error: "date, or start_date and end_date, are required" }, 400);
  }

  const service = createServiceClient();

  const dayResults = await Promise.all(
    dates.map((date) =>
      service.rpc("get_available_slots", {
        p_subdomain: body.subdomain,
        p_offering_id: body.offering_id,
        p_date: date,
      }),
    ),
  );

  for (const { error } of dayResults) {
    if (error) return jsonResponse({ error: error.message }, 500);
  }

  let slots = dayResults.flatMap(({ data }) => (data ?? []) as Slot[]);
  slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (slots.length === 0) return jsonResponse({ slots: [] });

  // Resolve tenant to look up Google connection
  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("subdomain", body.subdomain)
    .maybeSingle();
  if (!tenant?.id) return jsonResponse({ slots });

  let conn = null;
  try {
    conn = await getValidAccessToken(service, tenant.id as string);
  } catch (e) {
    console.error("[get-available-slots] token error", String(e));
    conn = null;
  }
  if (!conn) return jsonResponse({ slots });

  const timeMin = slots[0].starts_at;
  const timeMax = slots[slots.length - 1].ends_at;

  let busy: BusyInterval[] | null = null;
  for (let attempt = 0; attempt < 2 && busy === null; attempt++) {
    try {
      busy = await freeBusy(conn, timeMin, timeMax);
    } catch (e) {
      console.error(`[get-available-slots] freebusy attempt ${attempt + 1} failed`, String(e));
      busy = null;
    }
  }

  if (busy === null) {
    // Fail closed: cannot verify calendar → hide slots rather than risk double-booking.
    return jsonResponse({ slots: [], freebusy_unavailable: true });
  }

  slots = slots.filter((s) => !busy!.some((b) => overlaps(s, b)));
  return jsonResponse({ slots });
});

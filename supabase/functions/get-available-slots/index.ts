/**
 * get-available-slots
 * Composes DB availability (get_available_slots RPC) with Google Calendar free/busy
 * when the tenant is connected. This is the layer where S3c "freebusy inside
 * availability" lives — a SQL function cannot make outbound HTTP calls.
 *
 * Failure policy: if the tenant is connected but free/busy fails after one retry,
 * we FAIL CLOSED (drop all slots for the day) to minimise double-booking risk.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { freeBusy, getValidAccessToken, type BusyInterval } from "../_shared/google-calendar.ts";

interface Slot {
  starts_at: string;
  ends_at: string;
}

function overlaps(slot: Slot, busy: BusyInterval): boolean {
  return new Date(slot.starts_at) < new Date(busy.end) && new Date(slot.ends_at) > new Date(busy.start);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { subdomain?: string; offering_id?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (!body.subdomain || !body.offering_id || !body.date) {
    return jsonResponse({ error: "subdomain, offering_id and date are required" }, 400);
  }

  const service = createServiceClient();

  const { data: slotsData, error } = await service.rpc("get_available_slots", {
    p_subdomain: body.subdomain,
    p_offering_id: body.offering_id,
    p_date: body.date,
  });
  if (error) return jsonResponse({ error: error.message }, 500);
  let slots = (slotsData ?? []) as Slot[];
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

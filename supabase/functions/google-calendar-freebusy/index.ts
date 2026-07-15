/**
 * google-calendar-freebusy
 * Returns Google Calendar busy intervals for a tenant over [time_min, time_max].
 * Used internally by the availability path (get-available-slots) and for testing.
 * Returns { connected: false } when the tenant has not connected Google Calendar.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { freeBusy, getValidAccessToken } from "../_shared/google-calendar.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { subdomain?: string; time_min?: string; time_max?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (!body.subdomain || !body.time_min || !body.time_max) {
    return jsonResponse({ error: "subdomain, time_min and time_max are required" }, 400);
  }

  const service = createServiceClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("subdomain", body.subdomain)
    .maybeSingle();
  if (!tenant?.id) return jsonResponse({ error: "Tenant not found" }, 404);

  const conn = await getValidAccessToken(service, tenant.id as string);
  if (!conn) return jsonResponse({ connected: false, busy: [] });

  try {
    const busy = await freeBusy(conn, body.time_min, body.time_max);
    return jsonResponse({ connected: true, busy });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "freebusy failed" }, 502);
  }
});

/**
 * google-calendar-sync-event
 * Admin-triggered insert/delete of a booking's Google Calendar event.
 * Insert normally happens automatically on payment finalisation; this function
 * handles the cancel (delete) path and manual re-sync. Non-blocking by design.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";
import { syncBookingEventDelete, syncBookingEventInsert } from "../_shared/sync-booking-event.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  let body: { engagement_id?: string; action?: "insert" | "delete" };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (!body.engagement_id || (body.action !== "insert" && body.action !== "delete")) {
    return jsonResponse({ error: "engagement_id and action (insert|delete) are required" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  const tenantId = profile?.tenant_id as string | undefined;
  const roles = (profile?.role as string[] | null) ?? [];
  if (!tenantId || !roles.includes("tenant_admin")) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  // Engagement must belong to the caller's tenant
  const { data: eng } = await service
    .from("engagements")
    .select("tenant_id")
    .eq("id", body.engagement_id)
    .maybeSingle();
  if (!eng || eng.tenant_id !== tenantId) {
    return jsonResponse({ error: "Engagement not found" }, 404);
  }

  if (body.action === "insert") {
    await syncBookingEventInsert(service, tenantId, body.engagement_id);
  } else {
    await syncBookingEventDelete(service, tenantId, body.engagement_id);
  }

  return jsonResponse({ ok: true });
});

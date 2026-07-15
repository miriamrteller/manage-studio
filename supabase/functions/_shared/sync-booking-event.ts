import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { deleteEvent, getValidAccessToken, insertEvent } from "./google-calendar.ts";

/**
 * Push a confirmed appointment engagement to Google Calendar (best-effort).
 * Non-blocking: connection/API errors are logged, never thrown — payment
 * finalisation must not fail because Google is unavailable. Idempotent via
 * engagements.google_event_id.
 */
export async function syncBookingEventInsert(
  service: SupabaseClient,
  tenantId: string,
  engagementId: string,
): Promise<void> {
  try {
    const { data: eng } = await service
      .from("engagements")
      .select("id, status, booked_starts_at, booked_ends_at, google_event_id, offering_id, person_id")
      .eq("id", engagementId)
      .maybeSingle();

    if (!eng || !eng.booked_starts_at || !eng.booked_ends_at) return;
    if (eng.google_event_id) return; // already synced
    if (eng.status !== "active" && eng.status !== "pending_waiver") return;

    const conn = await getValidAccessToken(service, tenantId);
    if (!conn) return; // Google not connected — non-blocking skip

    const [{ data: offering }, { data: person }] = await Promise.all([
      service.from("offerings").select("name").eq("id", eng.offering_id).maybeSingle(),
      service.from("people").select("name, email").eq("id", eng.person_id).maybeSingle(),
    ]);

    const summary = `${offering?.name ?? "Appointment"} — ${person?.name ?? ""}`.trim();
    const eventId = await insertEvent(conn, {
      summary,
      description: person?.email ? `Client: ${person.email}` : "",
      start: eng.booked_starts_at as string,
      end: eng.booked_ends_at as string,
      attendeeEmail: (person?.email as string | null) ?? null,
    });

    if (eventId) {
      await service.from("engagements").update({ google_event_id: eventId }).eq("id", engagementId);
    }
  } catch (e) {
    console.error("[sync-booking-event] insert failed", engagementId, String(e));
  }
}

export async function syncBookingEventDelete(
  service: SupabaseClient,
  tenantId: string,
  engagementId: string,
): Promise<void> {
  try {
    const { data: eng } = await service
      .from("engagements")
      .select("id, google_event_id")
      .eq("id", engagementId)
      .maybeSingle();

    if (!eng?.google_event_id) return;

    const conn = await getValidAccessToken(service, tenantId);
    if (!conn) return;

    await deleteEvent(conn, eng.google_event_id as string);
    await service.from("engagements").update({ google_event_id: null }).eq("id", engagementId);
  } catch (e) {
    console.error("[sync-booking-event] delete failed", engagementId, String(e));
  }
}

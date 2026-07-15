/**
 * booking-expiry-sweep — Supabase Edge Function (pg_cron, every 5 minutes)
 *
 * Releases expired RESERVED bookings and sends pre-expiry nudge notifications.
 *
 * Flow (spec §7 edge function 3):
 *   1. Update bookings SET state = RELEASED
 *      WHERE state = RESERVED AND pr_expires_at < NOW()
 *   2. Send nudge email at pr_expires_at - payment_nudge_minutes
 *   3. CONFIRMED bookings are never released (T-22)
 *
 * Configurable per tenant: payment_expiry_minutes, payment_nudge_minutes.
 */

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (_req: Request): Promise<Response> => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();

    // ── 1. Release expired RESERVED bookings ────────────────────────────────
    const { data: released, error: releaseErr } = await supabase
      .from("bookings")
      .update({ state: "RELEASED" })
      .eq("state", "RESERVED")
      .lt("pr_expires_at", now.toISOString())
      .select("id, tenant_id");

    if (releaseErr) {
      console.error("[booking-expiry-sweep] release error", releaseErr);
    } else {
      console.log(`[booking-expiry-sweep] released ${released?.length ?? 0} bookings`);
    }

    // ── 2. Send pre-expiry nudge emails ─────────────────────────────────────
    // Find RESERVED bookings approaching expiry within each tenant's nudge window
    // Default nudge window = 5 minutes; per-tenant config from tenant_settings
    const { data: approaching } = await supabase
      .from("bookings")
      .select(`
        id,
        tenant_id,
        client_name,
        client_email,
        pr_link,
        pr_expires_at,
        tenant_settings!inner(payment_nudge_minutes)
      `)
      .eq("state", "RESERVED")
      .gt("pr_expires_at", now.toISOString());

    if (approaching) {
      for (const booking of approaching) {
        const nudgeMinutes = (booking as any).tenant_settings?.payment_nudge_minutes ?? 5;
        const expiresAt    = new Date((booking as any).pr_expires_at);
        const nudgeAt      = new Date(expiresAt.getTime() - nudgeMinutes * 60 * 1000);

        if (now >= nudgeAt && now < expiresAt) {
          // Within the nudge window — fire notification (fire-and-forget)
          _sendNudgeEmail(supabase, booking as any).catch(err =>
            console.error("[booking-expiry-sweep] nudge email error", err),
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        released: released?.length ?? 0,
        nudge_candidates: approaching?.length ?? 0,
        timestamp: now.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[booking-expiry-sweep] unhandled error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function _sendNudgeEmail(
  supabase: ReturnType<typeof createClient>,
  booking: {
    id:           string;
    tenant_id:    string;
    client_name:  string;
    client_email: string;
    pr_link:      string;
    pr_expires_at: string;
  },
): Promise<void> {
  // TODO: invoke send-notification edge function with nudge template
  console.log(
    `[booking-expiry-sweep] nudge due for booking ${booking.id} ` +
    `client=${booking.client_email} expires=${booking.pr_expires_at}`,
  );
}

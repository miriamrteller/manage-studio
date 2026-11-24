/**
 * client-sign-in: booked clients sign in without a password, and without an account
 * made for them by hand (owner, 11 Nov 2026).
 *
 *   { action: "open", token }   (no sign-in: the token is the credential)
 *     → { ok, access_token, refresh_token } — a normal session for the client's own
 *       login at the studio. The token comes from the "Sign in to your page" button in
 *       a booking or enrolment confirmation email (valid 3 days).
 *   { action: "prepare", subdomain, email }   (the studio login page, before it sends
 *     the sign-in email)
 *     → { ok: true } always. When the email is a booked or imported client at that
 *       studio and has no login yet, the login is made then (no email sent), so the sign-in email that
 *       follows reaches them. Anyone else gets the same answer and nothing happens.
 *
 * Safety: never a staff, admin, platform-owner or other-studio login (client-login.ts).
 */
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import {
  cleanSignInToken,
  clientHasBooking,
  clientWasImported,
  ensureClientLogin,
  normaliseEmail,
  openClientSignInLink,
} from "../_shared/client-login.ts";

Deno.serve(withMonitoring("client-sign-in", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const service = createServiceClient();

  if (body?.action === "open") {
    const token = cleanSignInToken(body.token);
    if (!token) return jsonResponse({ ok: false, code: "expired" }, 400);
    const result = await openClientSignInLink(service, token);
    return jsonResponse(result, result.ok ? 200 : 400);
  }

  if (body?.action === "prepare") {
    const subdomain = typeof body.subdomain === "string" ? body.subdomain.trim().toLowerCase() : "";
    const email = normaliseEmail(body.email);
    if (subdomain && email.includes("@") && email.length <= 320) {
      try {
        const { data: tenant } = await service
          .from("tenants")
          .select("id")
          .eq("subdomain", subdomain)
          .maybeSingle();
        const tenantId = (tenant?.id as string | null) ?? null;
        if (
          tenantId &&
          (await clientHasBooking(service, { tenantId, email }) ||
            await clientWasImported(service, { tenantId, email }))
        ) {
          await ensureClientLogin(service, { tenantId, email });
        }
      } catch (err) {
        console.error("[client-sign-in] prepare failed:", err instanceof Error ? err.message : err);
      }
    }
    // The same answer whoever asks: this never tells anyone whether an email is a client.
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "bad_request" }, 400);
}));

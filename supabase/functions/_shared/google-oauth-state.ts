/**
 * Signed OAuth `state` for Google Calendar connect.
 *
 * Format: <base64url-payload>.<base64url-hmac-sig>
 * Payload: { tid, uid, exp, n } — tenant, admin user, expiry (unix s), nonce.
 *
 * Prevents account-linking CSRF: a forged state with the victim's tenant_id
 * alone is rejected because the HMAC (and uid binding) will not match.
 */

import { hmacSha256Base64url, timingSafeEqual } from "./hmac.ts";
import { isGoogleMock } from "./google-calendar.ts";

export interface GoogleOAuthStatePayload {
  tid: string;
  uid: string;
  exp: number;
  n: string;
}

const STATE_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
  if (clientSecret) return clientSecret;
  if (isGoogleMock()) return "mock-google-oauth-state-secret";
  throw new Error("GOOGLE_CALENDAR_CLIENT_SECRET env var is not set");
}

function encodeB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function decodeB64url(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function signGoogleOAuthState(
  tenantId: string,
  userId: string,
): Promise<string> {
  const payload: GoogleOAuthStatePayload = {
    tid: tenantId,
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    n: crypto.randomUUID(),
  };
  const payloadB64 = encodeB64url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const sig = await hmacSha256Base64url(getSecret(), payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies signature, expiry, and that tid/uid match the authenticated admin.
 * Returns the payload or null if invalid.
 */
export async function verifyGoogleOAuthState(
  state: string,
  expectedTenantId: string,
  expectedUserId: string,
): Promise<GoogleOAuthStatePayload | null> {
  try {
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const payloadB64 = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);

    const expectedSig = await hmacSha256Base64url(getSecret(), payloadB64);
    if (!timingSafeEqual(sig, expectedSig)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeB64url(payloadB64)),
    ) as GoogleOAuthStatePayload;

    if (
      typeof payload.tid !== "string" ||
      typeof payload.uid !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.n !== "string"
    ) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.tid !== expectedTenantId) return null;
    if (payload.uid !== expectedUserId) return null;

    return payload;
  } catch {
    return null;
  }
}

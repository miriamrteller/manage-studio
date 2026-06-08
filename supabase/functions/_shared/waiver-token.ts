/**
 * Waiver link token — a compact HMAC-signed token used to authorise
 * unauthenticated guests to sign a specific waiver engagement.
 *
 * Format:  <base64url-payload>.<base64url-hmac-sig>
 * Payload: { eid, tid, em, exp } — short keys keep email URLs tidy.
 *
 * Uses env var WAIVER_LINK_SECRET (distinct from WAIVER_HMAC_KEY_V* which
 * is reserved for the waiver-evidence record HMAC).
 *
 * Expiry should be set to the engagement's waiver_deadline so the link
 * stays valid for exactly as long as the guest has to sign.
 */

import { hmacSha256Base64url, timingSafeEqual } from "./hmac.ts";

export interface WaiverTokenPayload {
  eid: string; // engagement ID
  tid: string; // tenant ID
  em: string;  // recipient email
  exp: number; // unix timestamp (seconds) — hard expiry
}

function getSecret(): string {
  const s = Deno.env.get("WAIVER_LINK_SECRET");
  if (!s) throw new Error("WAIVER_LINK_SECRET env var is not set");
  return s;
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

export async function signWaiverToken(
  payload: WaiverTokenPayload,
): Promise<string> {
  const payloadB64 = encodeB64url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const sig = await hmacSha256Base64url(getSecret(), payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies signature and expiry. Returns the payload or null if invalid.
 * Never throws — all errors collapse to null so callers can return 401.
 */
export async function verifyWaiverToken(
  token: string,
): Promise<WaiverTokenPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);

    const expectedSig = await hmacSha256Base64url(getSecret(), payloadB64);
    if (!timingSafeEqual(sig, expectedSig)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeB64url(payloadB64)),
    ) as WaiverTokenPayload;

    if (
      typeof payload.eid !== "string" ||
      typeof payload.tid !== "string" ||
      typeof payload.em !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts a waiver token from an Authorization header of the form:
 *   Authorization: WaiverToken <token>
 * Returns null if the header is absent or uses a different scheme.
 */
export function extractWaiverToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("WaiverToken ")) return null;
  return authHeader.slice("WaiverToken ".length).trim() || null;
}

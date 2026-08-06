/**
 * Waiver link token — a compact HMAC-signed token used to authorise
 * unauthenticated guests to sign a specific waiver engagement.
 *
 * Format:  <base64url-payload>.<base64url-hmac-sig>
 * Payload: { eid, tid, em, exp } — short keys keep email URLs tidy.
 *
 * Signed with a PER-TENANT secret (tenants.waiver_link_secret_enc, via the
 * get_tenant_waiver_link_secret RPC — generated lazily, service_role only).
 * The verifier reads `tid` from the unverified payload purely as a lookup
 * key — the standard key-id pattern — then verifies the signature against
 * that tenant's secret, so a leaked secret forges links for one tenant,
 * not all of them. Distinct from WAIVER_HMAC_KEY_V* which is reserved for
 * the waiver-evidence record HMAC and deliberately stays out of the DB.
 *
 * Expiry should be set to the engagement's waiver_deadline so the link
 * stays valid for exactly as long as the guest has to sign.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { hmacSha256Base64url, timingSafeEqual } from "./edge-runtime/hmac.ts";

export interface WaiverTokenPayload {
  eid: string; // engagement ID
  tid: string; // tenant ID
  em: string;  // recipient email
  exp: number; // unix timestamp (seconds) — hard expiry
}

async function getTenantSecret(
  service: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data, error } = await service.rpc("get_tenant_waiver_link_secret", {
    p_tenant_id: tenantId,
  });
  if (error || typeof data !== "string" || data.length === 0) {
    throw new Error(
      `waiver link secret unavailable for tenant ${tenantId}: ${error?.message ?? "empty result"}`,
    );
  }
  return data;
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
  service: SupabaseClient,
  payload: WaiverTokenPayload,
): Promise<string> {
  const secret = await getTenantSecret(service, payload.tid);
  const payloadB64 = encodeB64url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const sig = await hmacSha256Base64url(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies signature and expiry. Returns the payload or null if invalid.
 * Never throws — all errors collapse to null so callers can return 401.
 */
export async function verifyWaiverToken(
  service: SupabaseClient,
  token: string,
): Promise<WaiverTokenPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);

    // The payload is UNVERIFIED at this point — tid is used only to look up
    // which tenant's secret to verify against (key-id pattern). Nothing else
    // is trusted until the signature check passes.
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

    const secret = await getTenantSecret(service, payload.tid);
    const expectedSig = await hmacSha256Base64url(secret, payloadB64);
    if (!timingSafeEqual(sig, expectedSig)) return null;

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

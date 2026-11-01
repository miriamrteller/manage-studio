/**
 * Marketing unsubscribe token — put in every marketing message so the
 * recipient can opt out in one click, without signing in
 * (Communications Law §30A: a simple way to refuse, by the same channel).
 *
 * Format:  <base64url-payload>.<base64url-hmac-sig>
 * Payload: { v: 1, tid, pid?, lid?, ch }  (person or lead, channel)
 *
 * Signed with the tenant's link secret (get_tenant_waiver_link_secret), with a
 * domain prefix so an unsubscribe token can never be replayed as a waiver
 * token or the other way round. No expiry: an unsubscribe link must keep
 * working for as long as the message exists.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { hmacSha256Base64url, timingSafeEqual } from "./edge-runtime/hmac.ts";

export type UnsubscribeChannel = "email" | "sms" | "whatsapp";

export interface UnsubscribeTokenPayload {
  v: 1;
  tid: string;
  pid?: string;
  lid?: string;
  ch: UnsubscribeChannel;
}

const DOMAIN = "unsubscribe:v1:";

async function tenantSecret(service: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await service.rpc("get_tenant_waiver_link_secret", { p_tenant_id: tenantId });
  if (error || typeof data !== "string" || data.length === 0) {
    throw new Error(`link secret unavailable for tenant ${tenantId}: ${error?.message ?? "empty"}`);
  }
  return data;
}

function encodeB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function decodeB64url(s: string): string {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function isUnsubscribePayload(value: unknown): value is UnsubscribeTokenPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const uuid = /^[0-9a-f-]{36}$/i;
  return (
    p.v === 1 &&
    typeof p.tid === "string" && uuid.test(p.tid) &&
    (p.ch === "email" || p.ch === "sms" || p.ch === "whatsapp") &&
    ((typeof p.pid === "string" && uuid.test(p.pid) && p.lid === undefined) ||
      (typeof p.lid === "string" && uuid.test(p.lid) && p.pid === undefined))
  );
}

export async function signUnsubscribeToken(
  service: SupabaseClient,
  payload: UnsubscribeTokenPayload,
): Promise<string> {
  const secret = await tenantSecret(service, payload.tid);
  const body = encodeB64url(JSON.stringify(payload));
  const sig = await hmacSha256Base64url(secret, DOMAIN + body);
  return `${body}.${sig}`;
}

/** Returns the payload, or null for anything malformed or not signed by the tenant. Never throws. */
export async function verifyUnsubscribeToken(
  service: SupabaseClient,
  token: string,
): Promise<UnsubscribeTokenPayload | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const payload: unknown = JSON.parse(decodeB64url(body));
    if (!isUnsubscribePayload(payload)) return null;
    const secret = await tenantSecret(service, payload.tid);
    const expected = await hmacSha256Base64url(secret, DOMAIN + body);
    return timingSafeEqual(sig, expected) ? payload : null;
  } catch {
    return null;
  }
}

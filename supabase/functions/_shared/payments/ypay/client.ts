/**
 * YPay HTTP client (API v1.9).
 *
 * YPay is a hosted-redirect gateway. Its conventions differ from Invoice4U's:
 *
 *  - **Bearer auth with a cached token.** POST /accessToken (client_id +
 *    client_secret) returns a token valid for one hour. Crucially, YPay rejects a
 *    second token request while one is still active (error 3001), so the token MUST
 *    be cached and reused — see getYpayAccessToken.
 *  - **Success is `responseCode: 1`.** Every response carries a numeric responseCode;
 *    anything other than 1 is a failure, surfaced with the mapped error message.
 *
 * Base URL from YPAY_API_BASE (default https://ypay.co.il/api/v1). The sandbox uses
 * the same host with sandbox client_id/secret.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { ypayErrorMessage } from "./errors.ts";

const DEFAULT_BASE = "https://ypay.co.il/api/v1";
const DEFAULT_TIMEOUT_MS = 20_000;
/** Refresh a bit early so an in-flight charge never races the 1h expiry. */
const TOKEN_SKEW_MS = 60_000;

export function ypayApiBase(): string {
  const base = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get("YPAY_API_BASE")?.trim();
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

export class YpayApiError extends Error {
  constructor(message: string, readonly code?: number, readonly httpStatus?: number) {
    super(message);
    this.name = "YpayApiError";
  }
}

export type YpayCredentials = {
  clientId: string;
  clientSecret: string;
};

type YpayResponse = Record<string, unknown>;

async function ypayFetch(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; json: YpayResponse; text: string }> {
  const url = `${ypayApiBase()}/${path.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new YpayApiError(`YPay ${path} request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let json: YpayResponse = {};
  if (text) {
    try {
      json = JSON.parse(text) as YpayResponse;
    } catch {
      // Non-JSON body: keep json empty, surface text in the error below.
      json = {};
    }
  }
  return { status: response.status, json, text };
}

/** True when the payload reports success (responseCode === 1). */
export function isYpaySuccess(json: YpayResponse): boolean {
  return Number(json.responseCode) === 1;
}

/** Throws a YpayApiError unless responseCode === 1. */
function assertYpayOk(path: string, status: number, json: YpayResponse, text: string): YpayResponse {
  if (status < 200 || status >= 300) {
    throw new YpayApiError(`YPay ${path} returned HTTP ${status}: ${text.slice(0, 300)}`, undefined, status);
  }
  if (!isYpaySuccess(json)) {
    const code = Number(json.responseCode);
    throw new YpayApiError(
      `YPay ${path} failed: ${ypayErrorMessage(code)} (responseCode ${json.responseCode ?? "missing"})`,
      Number.isFinite(code) ? code : undefined,
      status,
    );
  }
  return json;
}

/**
 * Returns a valid bearer token for the tenant, minting and caching one only when
 * the cache is empty or expired. Reuse is mandatory: re-requesting while a token is
 * still active fails with YPay error 3001.
 */
export async function getYpayAccessToken(
  service: SupabaseClient,
  tenantId: string,
  credentials: YpayCredentials,
): Promise<string> {
  const now = Date.now();

  const { data: cached } = await service
    .from("payment_provider_token_cache")
    .select("token, expires_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "ypay")
    .maybeSingle();

  if (
    cached?.token &&
    cached.expires_at &&
    new Date(cached.expires_at as string).getTime() - TOKEN_SKEW_MS > now
  ) {
    return cached.token as string;
  }

  const { status, json, text } = await ypayFetch(
    "accessToken",
    { client_id: credentials.clientId, client_secret: credentials.clientSecret },
    {},
  );

  const token = typeof json.access_token === "string" ? json.access_token : null;
  if (status < 200 || status >= 300 || !token) {
    const code = Number(json.responseCode);
    throw new YpayApiError(
      `YPay accessToken failed: ${ypayErrorMessage(code)} (${text.slice(0, 200)})`,
      Number.isFinite(code) ? code : undefined,
      status,
    );
  }

  // `lifetime` is milliseconds; fall back to 1h if absent.
  const lifetimeMs = Number(json.lifetime);
  const expiresAt = new Date(now + (Number.isFinite(lifetimeMs) && lifetimeMs > 0 ? lifetimeMs : 3_600_000));

  await service.from("payment_provider_token_cache").upsert({
    tenant_id: tenantId,
    provider: "ypay",
    token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date(now).toISOString(),
  });

  return token;
}

/** Authenticated POST to a YPay endpoint. Returns the payload, throws on failure. */
export async function ypayPost(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<YpayResponse> {
  const { status, json, text } = await ypayFetch(path, body, {
    authorization: `Bearer ${token}`,
  });
  return assertYpayOk(path, status, json, text);
}

/** Unauthenticated accessToken check — validates client_id / client_secret. */
export async function ypayVerifyAccessToken(credentials: YpayCredentials): Promise<void> {
  const { status, json, text } = await ypayFetch(
    "accessToken",
    { client_id: credentials.clientId, client_secret: credentials.clientSecret },
    {},
  );
  // Error 3001 ("already an active token") means the credentials are valid — a token
  // exists for them — so it counts as a successful auth check.
  if (Number(json.responseCode) === 3001) return;
  if (status < 200 || status >= 300 || typeof json.access_token !== "string") {
    const code = Number(json.responseCode);
    throw new YpayApiError(
      `YPay credential check failed: ${ypayErrorMessage(code)} (${text.slice(0, 200)})`,
      Number.isFinite(code) ? code : undefined,
      status,
    );
  }
}

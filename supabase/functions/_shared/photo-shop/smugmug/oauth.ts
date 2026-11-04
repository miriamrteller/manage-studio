/**
 * SmugMug OAuth 1.0a with the studio's OWN API Key and Secret (owner decision 4 Nov:
 * no platform-wide key). Plain TypeScript (fetch + Web Crypto), so the same file runs in
 * Edge Functions and in the web app's unit tests.
 *
 * SmugMug facts used here, from https://api.smugmug.com/api/v2/doc/tutorial/authorization.html :
 *   - request token  https://api.smugmug.com/services/oauth/1.0a/getRequestToken
 *   - authorize      https://api.smugmug.com/services/oauth/1.0a/authorize
 *                    with Access (Full | Public) and Permissions (Read | Add | Modify)
 *   - access token   https://api.smugmug.com/services/oauth/1.0a/getAccessToken
 *   - oauth_callback=<url> sends the user back automatically; oauth_callback=oob doesn't
 *   - signature methods HMAC-SHA1 or PLAINTEXT (https only); we use HMAC-SHA1
 * and from https://api.smugmug.com/api/v2/doc/reference/user.html :
 *   - /api/v2!authuser is "The authenticated user".
 * Signing itself is standard OAuth 1.0a (RFC 5849).
 */

export const SMUGMUG_REQUEST_TOKEN_URL = "https://api.smugmug.com/services/oauth/1.0a/getRequestToken";
export const SMUGMUG_AUTHORIZE_URL = "https://api.smugmug.com/services/oauth/1.0a/authorize";
export const SMUGMUG_ACCESS_TOKEN_URL = "https://api.smugmug.com/services/oauth/1.0a/getAccessToken";
export const SMUGMUG_AUTHUSER_URL = "https://api.smugmug.com/api/v2!authuser";

/**
 * Where SmugMug sends the photographer back. The SAME for every studio (custom domains too):
 * photographers type it into SmugMug when they apply for their key, so it must not change.
 */
export const SMUGMUG_CALLBACK_PATH = "/admin/setup/integrations/smugmug/callback";

const TIMEOUT_MS = 15_000;

export interface SmugMugKeys {
  apiKey: string;
  apiSecret: string;
}

export interface SmugMugToken {
  token: string;
  secret: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OAuthClock {
  /** Unix seconds. */
  now(): number;
  nonce(): string;
}

const defaultClock: OAuthClock = {
  now: () => Math.floor(Date.now() / 1000),
  nonce: () => crypto.randomUUID().replace(/-/g, ""),
};

/** SmugMug refused or failed a call. `status` is the HTTP status (0 = network / timeout). */
export class SmugMugError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "SmugMugError";
  }
  /** 401: the key, secret or token was refused. */
  get rejected(): boolean {
    return this.status === 401;
  }
}

/** RFC 5849 §3.6 percent-encoding (unreserved: ALPHA, DIGIT, "-", ".", "_", "~"). */
export function oauthEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function hmacSha1Base64(key: string, text: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(text))));
}

/** RFC 5849 §3.4.1 signature base string. `params` holds oauth_* and query parameters. */
export function signatureBaseString(method: string, url: string, params: Array<[string, string]>): string {
  const u = new URL(url);
  const all: Array<[string, string]> = [...params];
  u.searchParams.forEach((v, k) => all.push([k, v]));
  const normalised = all
    .map(([k, v]) => [oauthEncode(k), oauthEncode(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const port = u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80"))
    ? `:${u.port}`
    : "";
  const baseUri = `${u.protocol}//${u.hostname.toLowerCase()}${port}${u.pathname}`;
  return [method.toUpperCase(), oauthEncode(baseUri), oauthEncode(normalised)].join("&");
}

/** The `Authorization: OAuth …` header for one signed request (HMAC-SHA1). */
export async function oauthHeader(
  method: string,
  url: string,
  keys: SmugMugKeys,
  token: SmugMugToken | null,
  extra: Record<string, string> = {},
  clock: OAuthClock = defaultClock,
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: clock.nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(clock.now()),
    oauth_version: "1.0",
    ...(token ? { oauth_token: token.token } : {}),
    ...extra,
  };
  const base = signatureBaseString(method, url, Object.entries(oauth));
  const signingKey = `${oauthEncode(keys.apiSecret)}&${oauthEncode(token?.secret ?? "")}`;
  oauth.oauth_signature = await hmacSha1Base64(signingKey, base);
  return "OAuth " + Object.entries(oauth).map(([k, v]) => `${oauthEncode(k)}="${oauthEncode(v)}"`).join(", ");
}

async function signedFetch(
  fetchImpl: FetchLike,
  url: string,
  keys: SmugMugKeys,
  token: SmugMugToken | null,
  extra: Record<string, string>,
  accept: string,
  clock: OAuthClock,
): Promise<Response> {
  const authorization = await oauthHeader("GET", url, keys, token, extra, clock);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { method: "GET", headers: { Authorization: authorization, Accept: accept }, signal: controller.signal });
  } catch {
    throw new SmugMugError(0, "SmugMug could not be reached");
  } finally {
    clearTimeout(timer);
  }
}

async function tokenCall(
  fetchImpl: FetchLike,
  url: string,
  keys: SmugMugKeys,
  token: SmugMugToken | null,
  extra: Record<string, string>,
  clock: OAuthClock,
): Promise<SmugMugToken> {
  const res = await signedFetch(fetchImpl, url, keys, token, extra, "application/x-www-form-urlencoded", clock);
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new SmugMugError(res.status, `SmugMug refused the request (${res.status})`);
  const body = new URLSearchParams(text);
  const t = body.get("oauth_token");
  const s = body.get("oauth_token_secret");
  if (!t || !s) throw new SmugMugError(res.status, "SmugMug sent an unexpected answer");
  return { token: t, secret: s };
}

export interface SmugMugOAuthDeps {
  fetch?: FetchLike;
  clock?: OAuthClock;
}

/** Step 1: a request token. `callback` is the fixed callback URL, or "oob" for a key check. */
export function getRequestToken(keys: SmugMugKeys, callback: string, deps: SmugMugOAuthDeps = {}): Promise<SmugMugToken> {
  return tokenCall(deps.fetch ?? fetch, SMUGMUG_REQUEST_TOKEN_URL, keys, null, { oauth_callback: callback }, deps.clock ?? defaultClock);
}

/** Step 2: where the photographer signs in. Access=Full (private galleries), Permissions=Read. */
export function authorizeUrl(requestToken: string): string {
  const q = new URLSearchParams({ oauth_token: requestToken, Access: "Full", Permissions: "Read" });
  return `${SMUGMUG_AUTHORIZE_URL}?${q.toString()}`;
}

/** Step 3: swap the request token + verifier for the access token. */
export function getAccessToken(
  keys: SmugMugKeys,
  requestToken: SmugMugToken,
  verifier: string,
  deps: SmugMugOAuthDeps = {},
): Promise<SmugMugToken> {
  return tokenCall(deps.fetch ?? fetch, SMUGMUG_ACCESS_TOKEN_URL, keys, requestToken, { oauth_verifier: verifier }, deps.clock ?? defaultClock);
}

/** Read-only call as the connected photographer (/api/v2!authuser). Resolves when SmugMug answers 200. */
export async function checkAuthUser(keys: SmugMugKeys, token: SmugMugToken, deps: SmugMugOAuthDeps = {}): Promise<void> {
  const res = await signedFetch(deps.fetch ?? fetch, SMUGMUG_AUTHUSER_URL, keys, token, {}, "application/json", deps.clock ?? defaultClock);
  await res.body?.cancel().catch(() => undefined);
  if (!res.ok) throw new SmugMugError(res.status, `SmugMug refused the request (${res.status})`);
}

/** What "Test connection" found. */
export type SmugMugCheck =
  | { ok: true; stage: "keys" | "account" }
  | { ok: false; code: "keys_rejected" | "token_rejected" | "unreachable" | "failed" };

/**
 * "Test connection". Connected: a read-only !authuser call with the access token.
 * Keys only: ask for a request token (callback "oob"), which proves the key and secret
 * work and changes nothing in the photographer's SmugMug account.
 */
export async function testSmugMugConnection(
  keys: SmugMugKeys,
  token: SmugMugToken | null,
  deps: SmugMugOAuthDeps = {},
): Promise<SmugMugCheck> {
  try {
    if (token) {
      await checkAuthUser(keys, token, deps);
      return { ok: true, stage: "account" };
    }
    await getRequestToken(keys, "oob", deps);
    return { ok: true, stage: "keys" };
  } catch (err) {
    if (err instanceof SmugMugError) {
      if (err.status === 0) return { ok: false, code: "unreachable" };
      if (err.rejected) return { ok: false, code: token ? "token_rejected" : "keys_rejected" };
    }
    return { ok: false, code: "failed" };
  }
}

/** The request token kept (encrypted) while the photographer is on SmugMug. */
export interface SmugMugPending {
  token: string;
  secret: string;
  /** Admin who pressed "Connect SmugMug". */
  uid: string;
  /** Unix seconds. */
  exp: number;
}

export const PENDING_TTL_SECONDS = 15 * 60;

export function parsePending(raw: string | null | undefined): SmugMugPending | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SmugMugPending>;
    if (typeof p.token !== "string" || typeof p.secret !== "string" || typeof p.uid !== "string" || typeof p.exp !== "number") {
      return null;
    }
    return p as SmugMugPending;
  } catch {
    return null;
  }
}

/** Constant-time string comparison. */
export function sameString(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** The callback belongs to this pending request: same token, same admin, not expired. */
export function pendingMatches(pending: SmugMugPending | null, oauthToken: string, userId: string, nowSeconds: number): boolean {
  if (!pending) return false;
  if (pending.exp < nowSeconds) return false;
  return sameString(pending.token, oauthToken) && pending.uid === userId;
}

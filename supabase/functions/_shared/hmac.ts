/** Encode bytes as base64url (URL-safe, no padding). */
function encodeBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Read the HMAC key for the given version from environment secrets. */
export function getHmacKey(version: number): string {
  const key = Deno.env.get(`WAIVER_HMAC_KEY_V${version}`);
  if (!key) throw new Error(`WAIVER_HMAC_KEY_V${version} secret not set`);
  return key;
}

/** Read the current HMAC key version from environment (defaults to 1). */
export function currentHmacVersion(): number {
  return parseInt(Deno.env.get("WAIVER_HMAC_CURRENT_VERSION") ?? "1", 10);
}

/** Constant-time string comparison to prevent timing attacks on HMAC values. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aB = new TextEncoder().encode(a);
  const bB = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i];
  return diff === 0;
}

async function importHmacKey(keyString: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyString),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Returns base64url HMAC-SHA256. Used for view_token (URL-safe). */
export async function hmacSha256Base64url(
  keyString: string,
  message: string,
): Promise<string> {
  const key = await importHmacKey(keyString);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return encodeBase64Url(new Uint8Array(sig));
}

/** Returns lowercase hex HMAC-SHA256. Used for record_hmac (VARCHAR 64 storage). */
export async function hmacSha256Hex(
  keyString: string,
  message: string,
): Promise<string> {
  const key = await importHmacKey(keyString);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns lowercase hex SHA-256. Used for pdf_sha256 and consent_version_hash. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

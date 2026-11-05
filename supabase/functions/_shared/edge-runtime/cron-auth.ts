import { jsonResponse } from "./cors.ts";
import { getEnv } from "./env.ts";

/** Compares in constant time, so the answer time says nothing about the secret. */
function sameSecret(sent: string, secret: string): boolean {
  const a = new TextEncoder().encode(sent);
  const b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/**
 * Checks a scheduled-job request (pg_cron or a manual call) for CRON_SECRET,
 * sent as `x-cron-secret: <secret>` or `Authorization: Bearer <secret>`.
 *
 * Fails closed: when CRON_SECRET is not set, every request is refused.
 * Returns the response to send back, or null when the request may go on.
 */
export function rejectUnlessCron(req: Request): Response | null {
  const secret = getEnv("CRON_SECRET") ?? "";
  if (!secret) {
    console.error("CRON_SECRET is not configured: refusing the request");
    return jsonResponse({ error: "CRON_SECRET is not configured" }, 500);
  }
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : "";
  if (sameSecret(cronHeader, secret) || sameSecret(bearer, secret)) return null;
  return jsonResponse({ error: "Unauthorized" }, 401);
}

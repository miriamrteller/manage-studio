/**
 * Twilio request signature (X-Twilio-Signature): base64 HMAC-SHA1, keyed with
 * the account auth token, over the full webhook URL followed by every POST
 * parameter (name + value) sorted by name.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
import { timingSafeEqual } from "./edge-runtime/hmac.ts";

export async function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...sig));
}

export async function isValidTwilioRequest(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await twilioSignature(authToken, url, params);
  return timingSafeEqual(signature, expected);
}

/** STOP / unsubscribe keywords in English and Hebrew (whole message, case-insensitive). */
const STOP_WORDS = new Set([
  "stop", "stopall", "unsubscribe", "cancel", "end", "quit",
  "הסר", "הסרה", "הסירו", "תסירו", "להסרה", "הסר אותי",
]);

export function isStopMessage(body: string | null | undefined): boolean {
  const text = (body ?? "").trim().toLowerCase().replace(/[.!״"']/g, "");
  return STOP_WORDS.has(text);
}

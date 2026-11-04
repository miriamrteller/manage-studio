/**
 * Admin "Send form" links that prefill the enquiry form (prefill audit row 20).
 * The token is random (256 bits) and travels only in the URL fragment, which
 * browsers never send to a server or in a Referer. Only its sha256 is stored.
 */

/** Valid for 14 days (owner decision). */
export const INVITE_TTL_DAYS = 14;

/** A new random token, base64url (43 characters). */
export function newInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** sha256 of the token, hex: what lead_form_invites.token_hash stores. */
export async function inviteTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The link: the form URL with the token in the fragment (#invite=…). */
export function inviteUrl(formUrl: string, token: string): string {
  return `${formUrl.split("#")[0]}#invite=${encodeURIComponent(token)}`;
}

/** A token as the form sends it: base64url, 32–128 characters, else ignored. */
export function cleanInviteToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(t) ? t : null;
}

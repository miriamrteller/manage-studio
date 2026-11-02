/**
 * Pure checks for the public enquiry form (crm-lead-capture). Kept free of
 * Deno/Supabase imports so they are unit-tested directly.
 */

/**
 * Turnstile gate. With no secret configured the form works without a CAPTCHA
 * (honeypot + rate limit still apply); with one, a valid token is required.
 */
export async function leadCaptchaPasses(opts: {
  secret: string | null | undefined;
  token: string | null | undefined;
  verify: (secret: string, token: string) => Promise<boolean>;
}): Promise<boolean> {
  const secret = opts.secret?.trim();
  if (!secret) return true;
  const token = opts.token?.trim();
  if (!token) return false;
  try {
    return await opts.verify(secret, token);
  } catch {
    return false;
  }
}

export const CAMPAIGN_MAX_LENGTH = 100;

/**
 * Campaign tag from ?campaign= / ?utm_campaign=: trimmed, inner whitespace
 * collapsed, control characters removed, capped. Empty → null. Case kept, so
 * the studio sees exactly what it typed in its link.
 */
export function normaliseCampaign(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // deno-lint-ignore no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, CAMPAIGN_MAX_LENGTH) : null;
}

/**
 * Limits for send-lead-form-link (pure, unit-tested from apps/web).
 * Per studio: at most TENANT_HOURLY_LIMIT emails an hour (both kinds).
 * Per recipient: one email of each kind every RECIPIENT_COOLDOWN_MINUTES.
 */
export const TENANT_HOURLY_LIMIT = 30;
export const RECIPIENT_COOLDOWN_MINUTES = 10;

export type LeadLinkKind = "form" | "web_instructions";

export const LEAD_LINK_ACTIONS: Record<LeadLinkKind, string> = {
  form: "leads.form_link_sent",
  web_instructions: "leads.web_instructions_sent",
};

export function leadLinkLimitError(input: {
  sentByTenantLastHour: number;
  sentToRecipientRecently: boolean;
}): "tenant_limit" | "recipient_cooldown" | null {
  if (input.sentByTenantLastHour >= TENANT_HOURLY_LIMIT) return "tenant_limit";
  if (input.sentToRecipientRecently) return "recipient_cooldown";
  return null;
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

/** Lower-cased, trimmed address, or null when it is not a plausible single email address. */
export function normaliseRecipient(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

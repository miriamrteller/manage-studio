/**
 * Resolve the From / Reply-To pair for tenant transactional email
 * (enrolment, payment, waivers, dunning, announcements).
 *
 * The tenant's identity always wins. An earlier version checked a platform
 * NOTIFICATION_FROM_EMAIL env var FIRST and only fell back to the tenant — which
 * meant that setting that var in production (as the deployment checklist
 * instructs) silently made every tenant send as the platform. That inversion is
 * the thing this module exists to prevent.
 *
 * Rules:
 *   From     = branded address, but only once Resend has verified its domain;
 *              otherwise <subdomain>@PLATFORM_EMAIL_DOMAIN, which is always
 *              deliverable because the platform domain is verified once, globally.
 *   Reply-To = contact_email, always. It is NOT NULL in the schema, so a parent
 *              replying always reaches a human at the studio no matter which
 *              address the mail went out as.
 *
 * Sending therefore cannot fail for want of a sender: the platform fallback is
 * unconditional. The only hard failure is a missing contact_email, which the
 * database already forbids.
 *
 * Auth email (magic link, OTP) does NOT come through here — it goes via Supabase
 * Auth SMTP on the platform domain, which is correct: login mail should not be
 * tenant-branded.
 */

import { getEnv } from "./edge-runtime/env.ts";

export interface TenantSenderInput {
  subdomain: string;
  contact_email: string;
  from_email?: string | null;
  from_email_verified_at?: string | null;
}

export interface TenantSender {
  /** RFC 5322 From address. */
  from: string;
  /** Always the studio's real inbox. */
  replyTo: string;
}

/**
 * Platform sending domain, e.g. "opalswift.com". Required rather than defaulted:
 * a hardcoded fallback here is how `noreply@manage-studio.app` — a domain nobody
 * owns — ended up as the sender of record in three code paths.
 */
function platformEmailDomain(): string {
  const domain = getEnv("PLATFORM_EMAIL_DOMAIN")?.trim();
  if (!domain) {
    throw new Error(
      "PLATFORM_EMAIL_DOMAIN is not configured (e.g. opalswift.com). " +
        "It is the fallback sending domain for tenants without a verified branded domain.",
    );
  }
  return domain.replace(/^@/, "").toLowerCase();
}

/**
 * Branded senders are only honoured when the active transport can send from a
 * tenant domain. Cloudflare Email Sending onboards tenant domains
 * (`wrangler email sending enable <domain>`); the Resend fallback is verified
 * for the platform domain only, so under Resend a branded From would 403
 * ("domain is not verified") and the alert would silently never leave.
 */
function brandedTransportAvailable(): boolean {
  return Boolean(getEnv("CLOUDFLARE_ACCOUNT_ID")?.trim()) &&
    Boolean(getEnv("CLOUDFLARE_EMAIL_API_TOKEN")?.trim());
}

export function resolveTenantSender(tenant: TenantSenderInput): TenantSender {
  const replyTo = tenant.contact_email?.trim();
  if (!replyTo) {
    throw new Error(
      `Tenant ${tenant.subdomain} has no contact_email — cannot send without a Reply-To address.`,
    );
  }

  const branded = tenant.from_email?.trim();
  const verified = Boolean(tenant.from_email_verified_at);

  if (branded && verified && brandedTransportAvailable()) {
    return { from: branded, replyTo };
  }

  const subdomain = tenant.subdomain?.trim().toLowerCase();
  if (!subdomain) {
    throw new Error("Tenant has no subdomain — cannot build a fallback sender address.");
  }

  return { from: `${subdomain}@${platformEmailDomain()}`, replyTo };
}

/** Columns every caller must select for resolveTenantSender to work. */
export const TENANT_SENDER_COLUMNS =
  "subdomain, contact_email, from_email, from_email_verified_at";

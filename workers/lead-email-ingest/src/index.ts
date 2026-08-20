/**
 * lead-email-ingest — Cloudflare Email Worker (phase 2b lead capture).
 *
 * Bound as the domain CATCH-ALL via Email Routing (self-onboard rule: one
 * platform-side route, zero per-tenant setup — docs/plans/
 * crm-lead-capture-channels.md). Only addresses matching leads-<subdomain>@
 * are captured; everything else is dropped silently, exactly as an unrouted
 * address would be. Parsing and capture happen here; all DB logic lives in
 * the crm-lead-ingest Supabase edge function, which also SENDS the studio a
 * "new lead" alert (no Email Routing forward — forwards need a click-verified
 * destination per studio, which would be a per-tenant onboarding task).
 *
 * Design rules:
 *  - NEVER reject/bounce the sender: capture failures are logged only.
 *  - The Message-ID travels as source_ref, making redeliveries idempotent.
 *
 * Config: CRM_INGEST_URL var, CRM_INGEST_SECRET secret. See README.md.
 */

import PostalMime from "postal-mime";

interface Env {
  CRM_INGEST_URL: string;
  CRM_INGEST_SECRET: string;
}

interface EmailMessageLike {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream;
  readonly headers: Headers;
}

const ADDRESS_RE = /^leads-([a-z0-9-]+)@/i;

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export default {
  async email(message: EmailMessageLike, env: Env): Promise<void> {
    const match = message.to.match(ADDRESS_RE);
    const subdomain = match ? match[1].toLowerCase() : null;

    if (!subdomain) {
      // Catch-all sees every unrouted address on the domain; only leads-* is ours.
      console.log(`lead-email-ingest: ignoring non-lead address ${message.to}`);
      return;
    }

    try {
      const parsed = await PostalMime.parse(message.raw);
      const text = parsed.text ?? (parsed.html ? htmlToText(parsed.html) : null);
      const messageId =
        parsed.messageId ?? message.headers.get("Message-ID") ??
        `no-message-id:${message.from}:${Date.now()}`;

      const response = await fetch(env.CRM_INGEST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CRM_INGEST_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantSubdomain: subdomain,
          message: {
            messageId,
            fromName: parsed.from?.name || null,
            fromEmail: parsed.from?.address ?? message.from ?? null,
            subject: parsed.subject ?? null,
            text,
            receivedAt: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        console.error(
          `lead-email-ingest: ingest returned ${response.status} for ${message.to}`,
          await response.text().catch(() => ""),
        );
      } else {
        console.log(
          `lead-email-ingest: captured for ${subdomain}`,
          await response.text().catch(() => ""),
        );
      }
    } catch (err) {
      console.error("lead-email-ingest: capture failed", err);
    }
  },
};

/**
 * lead-email-ingest — Cloudflare Email Worker (phase 2b lead capture).
 *
 * Bound to leads-<subdomain>@opalswift.com addresses via Email Routing.
 * Parses the inbound inquiry and hands it to the crm-lead-ingest Supabase
 * edge function (which owns all DB logic); optionally forwards the original
 * email onward so the studio still sees it in their real inbox.
 *
 * Design rules:
 *  - NEVER reject/bounce the sender: capture failures are logged, and the
 *    forward (when configured) is attempted regardless, so a broken ingest
 *    can lose a CRM row but never a customer email.
 *  - The Message-ID travels as source_ref, making redeliveries idempotent.
 *
 * Config: CRM_INGEST_URL var, CRM_INGEST_SECRET secret, FORWARD_TO var
 * (optional; must be a verified Email Routing destination). See README.md.
 */

import PostalMime from "postal-mime";

interface Env {
  CRM_INGEST_URL: string;
  CRM_INGEST_SECRET: string;
  FORWARD_TO?: string;
}

interface EmailMessageLike {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream;
  readonly headers: Headers;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
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

    if (subdomain) {
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
        console.error("lead-email-ingest: capture failed (email NOT lost)", err);
      }
    } else {
      console.warn(`lead-email-ingest: address did not match leads-<subdomain>: ${message.to}`);
    }

    // Forward regardless of capture outcome — the studio's inbox is sacred.
    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (err) {
        console.error("lead-email-ingest: forward failed", err);
      }
    }
  },
};

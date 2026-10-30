/**
 * Claim → send → complete for one automatic email. The claim
 * (claim_automatic_email RPC) is what makes a cron overlap or a double-click
 * send at most once; it also returns NULL when the tenant switched the email off.
 */
import { type EmailAttachment, sendHtmlEmail } from "../email-client.ts";
import { resolveTenantSender, type TenantSenderInput } from "../notification-from.ts";
import type { PhotographerEmailKey } from "../photographer-email-shells/generated.ts";
import { renderPhotographerEmail } from "./render.ts";

/** Structural client type (see rate-limit.ts for why not SupabaseClient). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface AutomaticEmailTenant extends TenantSenderInput {
  id: string;
  name: string;
  language_default: string | null;
  primary_color: string | null;
  accent_color: string | null;
}

export const AUTOMATIC_EMAIL_TENANT_COLUMNS =
  "id, name, language_default, primary_color, accent_color, subdomain, contact_email, from_email, from_email_verified_at";

export type AutomaticEmailOutcome = "sent" | "skipped" | "failed";

export async function sendAutomaticEmail(
  client: RpcClient,
  input: {
    tenant: AutomaticEmailTenant;
    key: PhotographerEmailKey;
    quoteId?: string | null;
    engagementId?: string | null;
    to: string;
    variables: Record<string, string>;
    /** Delivered on transports that take attachments (see email-client.ts). */
    attachments?: EmailAttachment[];
  },
  /** Transport override for tests; production uses sendHtmlEmail. */
  send: typeof sendHtmlEmail = sendHtmlEmail,
): Promise<AutomaticEmailOutcome> {
  const { data: logId, error: claimError } = await client.rpc("claim_automatic_email", {
    p_tenant_id: input.tenant.id,
    p_email_key: input.key,
    p_quote_id: input.quoteId ?? null,
    p_engagement_id: input.engagementId ?? null,
    p_recipient_email: input.to,
  });
  if (claimError) throw new Error(`claim_automatic_email: ${claimError.message}`);
  if (typeof logId !== "string") return "skipped";

  try {
    const sender = resolveTenantSender(input.tenant);
    const { html, subject } = renderPhotographerEmail({
      key: input.key,
      language: input.tenant.language_default === "he" ? "he" : "en",
      schoolName: input.tenant.name,
      primaryColor: input.tenant.primary_color ?? "#2563eb",
      accentColor: input.tenant.accent_color ?? "#dc2626",
      variables: input.variables,
    });
    const result = await send({
      to: input.to,
      from: sender.from,
      replyTo: sender.replyTo,
      subject,
      html,
      attachments: input.attachments,
    });
    await client.rpc("complete_automatic_email", {
      p_log_id: logId, p_status: "sent", p_failure_reason: null, p_external_msg_id: result.id,
    });
    return "sent";
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    await client.rpc("complete_automatic_email", {
      p_log_id: logId, p_status: "failed", p_failure_reason: reason, p_external_msg_id: null,
    });
    return "failed";
  }
}

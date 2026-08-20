/**
 * Shared write path for automated lead capture — used by crm-lead-ingest
 * (inbound email) and crm-lead-capture (public inquiry form). One
 * implementation means a new capture channel cannot forget the dedupe rules
 * or the notification.
 *
 * Idempotency & dedupe, in order:
 *   1. same (tenant, source_ref), when a sourceRef exists → duplicate, no-op
 *   2. open lead with the same email (not converted, stage != lost)
 *        → touchpoint: update last_contacted_at + last_communication_note
 *   3. otherwise → new lead (marketing_consent false — consent is opt-in)
 */

import { sendHtmlEmail } from "../email-client.ts";
import { resolveTenantSender } from "../notification-from.ts";

export interface LeadFields {
  name: string;
  email: string | null;
  phone: string | null;
  interest: string | null;
  lastCommunicationNote: string | null;
}

export interface LeadTenant {
  id: string;
  name: string;
  subdomain: string;
  language_default: string;
  contact_email: string;
  from_email: string | null;
  from_email_verified_at: string | null;
}

/** Columns every caller must select from `tenants` for this module to work. */
export const LEAD_TENANT_COLUMNS =
  "id, name, subdomain, language_default, contact_email, from_email, from_email_verified_at";

export type LeadChannel = "email" | "website" | "whatsapp" | "linkedin" | "instagram";

/**
 * Capture-link source tag → leads.channel. The same public form serves every
 * social platform via `?src=` (docs/plans/crm-lead-capture-channels.md);
 * unknown or missing tags are honestly `website` — never a guess.
 */
export function channelFromSrc(src: string | null | undefined): LeadChannel {
  switch (src?.trim().toLowerCase()) {
    case "instagram":
      return "instagram";
    case "linkedin":
      return "linkedin";
    case "whatsapp":
      return "whatsapp";
    case "email":
      return "email";
    default:
      return "website";
  }
}

export interface LeadWriteOptions {
  channel: LeadChannel;
  /** Idempotency key (email Message-ID). Null for form posts. */
  sourceRef: string | null;
  receivedAt: string;
}

export interface LeadWriteResult {
  outcome: "created" | "updated" | "duplicate";
  leadId: string | null;
}

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export async function writeInboundLead(
  service: ServiceClient,
  tenant: LeadTenant,
  fields: LeadFields,
  opts: LeadWriteOptions,
): Promise<LeadWriteResult> {
  if (opts.sourceRef) {
    const { data: existing } = await service
      .from("leads")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("source_ref", opts.sourceRef)
      .maybeSingle();
    if (existing) {
      return { outcome: "duplicate", leadId: existing.id };
    }
  }

  if (fields.email) {
    const { data: open } = await service
      .from("leads")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("email", fields.email)
      .neq("stage", "lost")
      .is("converted_account_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open) {
      const { error: updateError } = await service
        .from("leads")
        .update({
          last_contacted_at: opts.receivedAt,
          last_communication_note: fields.lastCommunicationNote,
        })
        .eq("id", open.id)
        .eq("tenant_id", tenant.id);
      if (updateError) throw updateError;
      return { outcome: "updated", leadId: open.id };
    }
  }

  const { data: created, error: insertError } = await service
    .from("leads")
    .insert({
      tenant_id: tenant.id,
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      stage: "new",
      channel: opts.channel,
      interest: fields.interest,
      last_contacted_at: opts.receivedAt,
      last_communication_note: fields.lastCommunicationNote,
      marketing_consent: false,
      source_ref: opts.sourceRef,
    })
    .select("id")
    .single();
  if (insertError) {
    // Unique (tenant, source_ref) race: another delivery won — treat as duplicate.
    if ((insertError as { code?: string }).code === "23505") {
      return { outcome: "duplicate", leadId: null };
    }
    throw insertError;
  }

  return { outcome: "created", leadId: created.id };
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Best-effort "new lead" alert to the studio's inbox via the platform's Email
 * SENDING path. Deliberately not an Email Routing forward: forwards require a
 * click-verified destination per studio — a per-tenant onboarding task, which
 * the self-onboard rule bans (docs/plans/crm-lead-capture-channels.md).
 * Reply-To is the lead's own address, so the studio answers the inquirer with
 * one click. Failures are logged and never affect the capture.
 */
export async function notifyTenantOfLead(
  service: ServiceClient,
  tenant: LeadTenant,
  fields: LeadFields,
  outcome: "created" | "updated",
): Promise<void> {
  try {
    const he = tenant.language_default === "he";
    const subject = outcome === "created"
      ? (he ? `ליד חדש: ${fields.name}` : `New lead: ${fields.name}`)
      : (he ? `הודעה חדשה מליד קיים: ${fields.name}` : `New message from lead: ${fields.name}`);

    const rows: Array<[string, string | null]> = [
      [he ? "שם" : "Name", fields.name],
      [he ? "אימייל" : "Email", fields.email],
      [he ? "טלפון" : "Phone", fields.phone],
      [he ? "מתעניין/ת ב" : "Interested in", fields.interest],
      [he ? "ההודעה" : "Message", fields.lastCommunicationNote],
    ];
    const html = `<!doctype html><html dir="${he ? "rtl" : "ltr"}"><body>` +
      `<p>${he ? "התקבלה פנייה חדשה במערכת הלידים" : "A new inquiry landed in your leads inbox"} (${esc(tenant.name)}).</p>` +
      `<table cellpadding="4">` +
      rows
        .filter(([, value]) => value)
        .map(([label, value]) => `<tr><td><b>${label}</b></td><td>${esc(value as string)}</td></tr>`)
        .join("") +
      `</table>` +
      `<p>${he ? "ניתן להשיב ישירות למייל זה כדי לענות לפונה." : "Reply to this email to answer the inquirer directly."}</p>` +
      `</body></html>`;

    const sender = resolveTenantSender(tenant);
    const send = await sendHtmlEmail({
      to: tenant.contact_email,
      from: sender.from,
      subject,
      html,
      replyTo: fields.email ?? sender.replyTo,
    });

    await service.from("notification_log").insert({
      tenant_id: tenant.id,
      recipient_email: tenant.contact_email,
      channel: "email",
      template_name: "crm_new_lead",
      subject,
      body_preview: fields.lastCommunicationNote,
      external_msg_id: send.id,
      status: "sent",
    });
  } catch (err) {
    console.error("lead-ingest-core: lead notification failed (capture unaffected)", err);
  }
}

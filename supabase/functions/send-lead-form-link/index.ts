import { z } from "npm:zod@4.6.7";
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../_shared/notification-from.ts";
import { sendHtmlEmail } from "../_shared/email-client.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { formLinkEmail, websiteInstructionsEmail } from "../_shared/email-dist/leadShare.js";
import { FORM_TIME_ZONE, leadFormIsOpen, todayIn } from "../_shared/email-dist/leadForm.js";
import {
  LEAD_LINK_ACTIONS,
  leadLinkLimitError,
  normaliseRecipient,
  RECIPIENT_COOLDOWN_MINUTES,
} from "../_shared/crm-contract/lead-link-guard.ts";
import { INVITE_TTL_DAYS, inviteTokenHash, inviteUrl, newInviteToken } from "../_shared/lead-form-invite.ts";

/**
 * send-lead-form-link — a studio admin emails, from the studio:
 *   kind "form":             its enquiry form link to one person (tagged src=direct)
 *   kind "web_instructions": the embed code + steps to whoever runs its website
 * (docs/plans/LEADS.md, 2c-ii).
 *
 * The email is built here from fixed templates (packages/shared/src/leadShare.ts):
 * the admin supplies only the recipient and an optional first name, so the
 * platform cannot be used to send arbitrary text. Reply-To is the studio's
 * contact email. Rate-limited per studio and per recipient, and logged in
 * audit_log. Sending the link creates no lead and implies no consent: the
 * person becomes a lead only by filling in the form.
 */

const bodySchema = z.object({
  kind: z.enum(["form", "web_instructions"]),
  email: z.string().max(254),
  name: z.string().max(80).nullable().optional(),
  lang: z.enum(["en", "he"]).nullable().optional(),
  /** A named form (/f/<slug>) instead of the general /inquire form; kind "form" only. */
  formSlug: z.string().max(40).nullable().optional(),
});

Deno.serve(withMonitoring("send-lead-form-link", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

  const service = createServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: profile } = await service
    .from("user_profiles")
    .select("id, tenant_id, role, email")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
  const roles = (profile.role as string[] | null) ?? [];
  if (!roles.includes("tenant_admin") && !roles.includes("super_admin")) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }
  const recipient = normaliseRecipient(body.email);
  if (!recipient) return jsonResponse({ error: "invalid_email" }, 400);

  const tenantId = profile.tenant_id as string;
  const action = LEAD_LINK_ACTIONS[body.kind];

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const cooldownStart = new Date(Date.now() - RECIPIENT_COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { count: tenantCount } = await service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("action", Object.values(LEAD_LINK_ACTIONS))
    .gte("created_at", hourAgo);
  const { count: recipientCount } = await service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("action", action)
    .eq("after_state->>recipient_email", recipient)
    .gte("created_at", cooldownStart);
  const limited = leadLinkLimitError({
    sentByTenantLastHour: tenantCount ?? 0,
    sentToRecipientRecently: (recipientCount ?? 0) > 0,
  });
  if (limited) return jsonResponse({ error: limited }, 429);

  const { data: tenant } = await service
    .from("tenants")
    .select(`id, name, language_default, primary_color, ${TENANT_SENDER_COLUMNS}`)
    .eq("id", tenantId)
    .single();
  if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);

  const rootDomain = Deno.env.get("APP_ROOT_DOMAIN")?.trim();
  if (!rootDomain) return jsonResponse({ error: "APP_ROOT_DOMAIN is not configured" }, 500);
  const formOrigin = `https://${tenant.subdomain}.${rootDomain}`;
  const lang = body.lang ?? (tenant.language_default === "he" ? "he" : "en");
  const studio = (tenant.name as string) || (tenant.subdomain as string);

  let formPath = "/inquire";
  let formId: string | null = null;
  if (body.kind === "form" && body.formSlug) {
    const { data: form } = await service
      .from("lead_forms")
      .select("id, slug, active, ends_on")
      .eq("tenant_id", tenantId)
      .eq("slug", body.formSlug.trim().toLowerCase())
      .maybeSingle();
    if (!form) return jsonResponse({ error: "unknown_form" }, 404);
    if (!leadFormIsOpen(form as { active: boolean; ends_on: string | null }, todayIn(FORM_TIME_ZONE))) {
      return jsonResponse({ error: "form_closed" }, 409);
    }
    formPath = `/f/${form.slug}`;
    formId = (form as { id: string }).id;
  }

  // The link prefills the form with the name and email typed here: a random
  // token in the URL fragment (never the details themselves); only its hash is
  // stored. If it can't be stored, the link still works without the prefill.
  let formUrl = `${formOrigin}${formPath}?src=direct`;
  if (body.kind === "form") {
    const token = newInviteToken();
    const { error: inviteError } = await service.from("lead_form_invites").insert({
      tenant_id: tenantId,
      token_hash: await inviteTokenHash(token),
      recipient_email: recipient,
      recipient_name: body.name?.trim() || null,
      form_id: formId,
      created_by: profile.id,
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (inviteError) console.error("send-lead-form-link: invite not stored", inviteError.message);
    else formUrl = inviteUrl(formUrl, token);
  }

  const email = body.kind === "form"
    ? formLinkEmail({
      studio,
      recipientName: body.name ?? null,
      formUrl,
      lang,
      colour: tenant.primary_color as string | null,
    })
    : websiteInstructionsEmail({ studio, formOrigin, lang });

  let outcome: "sent" | "email_failed" = "sent";
  let externalId: string | null = null;
  try {
    const sender = resolveTenantSender(tenant as unknown as TenantSenderInput);
    const sent = await sendHtmlEmail({
      to: recipient,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    externalId = sent.id ?? null;
  } catch (err) {
    console.error("send-lead-form-link: email failed", err);
    outcome = "email_failed";
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: profile.id,
    actor_email: profile.email as string | null,
    action,
    entity_type: "lead_form",
    after_state: {
      recipient_email: recipient,
      kind: body.kind,
      lang,
      outcome,
      src: body.kind === "form" ? "direct" : null,
      form: body.kind === "form" ? formPath : null,
    },
  });
  if (outcome === "sent") {
    await service.from("notification_log").insert({
      tenant_id: tenantId,
      recipient_email: recipient,
      channel: "email",
      template_name: body.kind === "form" ? "lead_form_link" : "lead_form_web_instructions",
      subject: email.subject,
      external_msg_id: externalId,
      status: "sent",
    });
  }

  return outcome === "sent" ? jsonResponse({ ok: true }) : jsonResponse({ error: "email_failed" }, 502);
}));

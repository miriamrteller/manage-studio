import { z } from "npm:zod@4.6.7";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { checkAndIncrementAttempt, normaliseContactPoint } from "../_shared/rate-limit.ts";
import { isAllowedCrmOrigin } from "../_shared/crm-contract/allowed-origin.ts";
import {
  channelFromSrc,
  LEAD_TENANT_COLUMNS,
  type LeadTenant,
  notifyTenantOfLead,
  writeInboundLead,
} from "../_shared/crm-contract/lead-ingest-core.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { cleanInviteToken, inviteTokenHash } from "../_shared/lead-form-invite.ts";
import { leadCaptchaPasses, normaliseCampaign } from "../_shared/crm-contract/lead-capture-guard.ts";
import { assessLeadSpam, filledTooFast } from "../_shared/crm-contract/lead-spam.ts";
import {
  FORM_TIME_ZONE,
  formQuestions,
  leadFormIsOpen,
  leadFormKindFor,
  parseLeadFormConfig,
  questionsForForm,
  todayIn,
  validateLeadAnswers,
} from "../_shared/email-dist/leadForm.js";

/**
 * crm-lead-capture — PUBLIC inquiry-form endpoint (step 2 of
 * docs/plans/crm-lead-capture-channels.md).
 *
 * One endpoint serves every tenant and every "social" channel: the tenant
 * site's /inquire form POSTs here, and the studio's capture links tag the
 * source (?src=instagram|linkedin|whatsapp) so the lead lands with its real
 * acquisition channel. Unknown/missing src is honestly `website`. The same
 * form also runs inside an iframe on the studio's own site (/embed/inquire);
 * that page is on the tenant host too, so CORS is unchanged. An optional
 * ?campaign= tag is stored on new leads (leads.campaign).
 *
 * Abuse posture (no auth by design — it's an inquiry form):
 *   - CORS allowlist: tenant portals under APP_ROOT_DOMAIN + localhost dev.
 *   - Honeypot field `website`: bots that fill it get a 200 and no row.
 *   - Time trap `elapsedMs`: sent faster than a person can type gets a 200
 *     and no row.
 *   - Spam check (lead-spam.ts): a name or message no person writes (digits
 *     glued to letters, keyboard mashing, an address imitating OpalSwift, SEO
 *     sales pitches) is refused with 422 looks_like_spam, so a real person
 *     who trips it sees a message and can fix it.
 *   - Turnstile: when TURNSTILE_SECRET_KEY is set, a valid captchaToken is
 *     required (403 captcha_failed otherwise). Same widget as the login forms.
 *   - Rate limit: the shared fail-closed limiter (5/hour) keyed on the
 *     submitter's email, falling back to the caller IP.
 *   - Writes go only to `leads`, via the shared lead-ingest-core.
 */

const payloadSchema = z.object({
  tenantSubdomain: z.string().min(1).max(63),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  message: z.string().max(5000).nullable().optional(),
  interest: z.string().max(200).nullable().optional(),
  src: z.string().max(40).nullable().optional(),
  /** Free-text campaign tag (?campaign= / ?utm_campaign=), normalised server-side. */
  campaign: z.string().max(500).nullable().optional(),
  /** Cloudflare Turnstile token; required only when TURNSTILE_SECRET_KEY is set. */
  captchaToken: z.string().max(4096).nullable().optional(),
  /** Answers to the studio's extra questions, keyed by question key (validated below). */
  answers: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Named form (/f/<slug>); absent for the general /inquire form. */
  formSlug: z.string().max(40).nullable().optional(),
  /** Token from an admin's "Send form" link (#invite=…): links the lead to that invite. */
  invite: z.string().max(128).nullable().optional(),
  /** Honeypot — humans never see it, bots fill it. */
  website: z.string().max(200).nullable().optional(),
  /** Time trap: milliseconds the form was open before sending (absent = not checked). */
  elapsedMs: z.number().nullable().optional(),
  /**
   * Marketing opt-in per channel, with the exact wording shown next to each
   * box (Communications Law §30A proof of consent). Absent = no opt-in.
   */
  marketingConsent: z
    .object({
      version: z.string().max(64),
      items: z
        .array(
          z.object({
            kind: z.enum(["marketing_email", "marketing_sms", "marketing_whatsapp"]),
            wording: z.string().min(1).max(2000),
          }),
        )
        .max(3),
    })
    .nullable()
    .optional(),
});

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = isAllowedCrmOrigin(origin, {
    rootDomain: Deno.env.get("APP_ROOT_DOMAIN")?.trim() || null,
    configuredOrigin: Deno.env.get("CRM_CONTACTS_ALLOWED_ORIGIN")?.trim() || null,
  });
  if (!origin || !allowed) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Record opt-ins as consent_records and set the lead's quick flag. Never fails the inquiry. */
async function recordLeadMarketingConsent(
  service: ReturnType<typeof createServiceClient>,
  input: {
    tenantId: string;
    leadId: string;
    version: string;
    items: Array<{ kind: string; wording: string }>;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<void> {
  try {
    const rows = input.items.map((item) => ({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      kind: item.kind,
      granted: true,
      wording: item.wording,
      wording_version: input.version,
      source: "inquiry",
      ip_address: input.ip,
      user_agent: input.userAgent?.slice(0, 512) ?? null,
    }));
    const { error } = await service.from("consent_records").insert(rows);
    if (error) throw error;
    await service.from("leads").update({ marketing_consent: true }).eq("id", input.leadId);
  } catch (err) {
    console.error("crm-lead-capture: could not record marketing consent", err);
  }
}

Deno.serve(withMonitoring("crm-lead-capture", async (req) => {
  const cors = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }

  // Honeypot and time trap: pretend success, write nothing.
  if (nonEmpty(payload.website) || filledTooFast(payload.elapsedMs)) {
    return json({ outcome: "created" });
  }

  const spamCheck = assessLeadSpam({ name: payload.name, email: payload.email, message: payload.message });
  if (spamCheck.spam) {
    console.warn(`crm-lead-capture: refused as spam (${spamCheck.reasons.join(", ")})`);
    return json({ error: "looks_like_spam" }, 422);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const captchaOk = await leadCaptchaPasses({
    secret: Deno.env.get("TURNSTILE_SECRET_KEY"),
    token: payload.captchaToken,
    verify: (secret, token) => verifyTurnstile(secret, token, ip === "unknown" ? null : ip),
  });
  if (!captchaOk) {
    return json({ error: "captcha_failed" }, 403);
  }

  try {
    const service = createServiceClient();

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select(`${LEAD_TENANT_COLUMNS}, skin, business_preset, lead_form`)
      .eq("subdomain", payload.tenantSubdomain.toLowerCase())
      .single();
    if (tenantError || !tenant) {
      return json({ error: "Unknown tenant" }, 404);
    }
    const leadTenant = tenant as unknown as LeadTenant & {
      skin: string | null;
      business_preset: string | null;
      lead_form: unknown;
    };

    // Named form: narrows the questions and may pre-select a class or
    // package. An enquiry is never dropped because of its form: if the form
    // was switched off, passed its last day or was deleted while the visitor
    // had the page open, the lead is saved without the form (no form_id, no
    // pre-selected class), checked against the questions they were shown.
    let namedForm: { id: string; question_keys: string[] | null; offering_id: string | null } | null = null;
    let closedFormKeys: string[] | null = null;
    let unknownForm = false;
    if (payload.formSlug) {
      const { data: form } = await service
        .from("lead_forms")
        .select("id, active, ends_on, question_keys, offering_id")
        .eq("tenant_id", leadTenant.id)
        .eq("slug", payload.formSlug.trim().toLowerCase())
        .maybeSingle();
      if (!form) {
        unknownForm = true;
      } else if (!leadFormIsOpen(form as { active: boolean; ends_on: string | null }, todayIn(FORM_TIME_ZONE))) {
        closedFormKeys = (form as { question_keys: string[] | null }).question_keys;
      } else {
        namedForm = form as { id: string; question_keys: string[] | null; offering_id: string | null };
      }
    }

    // The studio's extra questions. Unknown keys are ignored; a required
    // question left empty or an invalid answer refuses the enquiry (400), so
    // the form can show which field to fix.
    const formConfig = parseLeadFormConfig(leadTenant.lead_form);
    const kind = leadFormKindFor(leadTenant.skin, leadTenant.business_preset);
    const needsClasses = formConfig.presets.class_interest?.enabled === true && kind === "classes";
    let classes: Array<{ id: string; name: string }> = [];
    if (needsClasses) {
      const { data: rows } = await service
        .from("offerings")
        .select("id, name")
        .eq("tenant_id", leadTenant.id)
        .eq("offering_type", "class")
        .eq("is_public", true)
        .eq("status", "active");
      classes = (rows ?? []) as Array<{ id: string; name: string }>;
    }
    const allQuestions = formQuestions(formConfig, kind, classes);
    const questions = unknownForm
      // We can't know what a deleted form showed: keep valid answers, require none.
      ? allQuestions.map((q) => ({ ...q, required: false }))
      : questionsForForm(allQuestions, namedForm ? namedForm.question_keys : closedFormKeys);
    const checked = validateLeadAnswers(questions, payload.answers ?? {});
    if (!checked.ok) {
      return json({ error: "invalid_answers", fields: checked.invalid }, 400);
    }

    const email = nonEmpty(payload.email)?.toLowerCase() ?? null;
    const contactPoint = normaliseContactPoint(email ?? `ip:${ip}`);
    const limit = await checkAndIncrementAttempt(service, leadTenant.id, contactPoint, "email");
    if (!limit.allowed) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }

    const fields = {
      name: payload.name.trim(),
      email,
      phone: nonEmpty(payload.phone),
      interest: nonEmpty(payload.interest),
      lastCommunicationNote: nonEmpty(payload.message),
    };

    const result = await writeInboundLead(service, leadTenant, fields, {
      channel: channelFromSrc(payload.src),
      sourceRef: null,
      receivedAt: new Date().toISOString(),
      campaign: normaliseCampaign(payload.campaign),
      form: questions.length > 0 || namedForm?.offering_id
        ? {
          // The form's own class/package applies unless the visitor picked one.
          columns: namedForm?.offering_id && !checked.columns.offering_id
            ? { ...checked.columns, offering_id: namedForm.offering_id }
            : checked.columns,
          answers: checked.answers,
        }
        : null,
      formId: namedForm?.id ?? null,
    });

    const optIns = payload.marketingConsent?.items ?? [];
    if (optIns.length > 0 && result.leadId) {
      await recordLeadMarketingConsent(service, {
        tenantId: leadTenant.id,
        leadId: result.leadId,
        version: payload.marketingConsent!.version,
        items: optIns,
        ip: ip === "unknown" ? null : ip,
        userAgent: req.headers.get("user-agent"),
      });
    }

    // Came from an admin's "Send form" link: mark the invite answered and link the lead.
    const inviteToken = cleanInviteToken(payload.invite);
    if (inviteToken && result.leadId) {
      const { error: inviteError } = await service
        .from("lead_form_invites")
        .update({ used_at: new Date().toISOString(), lead_id: result.leadId })
        .eq("tenant_id", leadTenant.id)
        .eq("token_hash", await inviteTokenHash(inviteToken))
        .gt("expires_at", new Date().toISOString())
        .is("used_at", null);
      if (inviteError) console.error("crm-lead-capture: invite not updated", inviteError.message);
    }

    if (result.outcome !== "duplicate") {
      await notifyTenantOfLead(service, leadTenant, fields, result.outcome);
    }

    return json({ outcome: result.outcome }, result.outcome === "created" ? 201 : 200);
  } catch (err) {
    console.error("crm-lead-capture: unhandled error", err);
    return json({ error: "Internal error" }, 500);
  }
}));

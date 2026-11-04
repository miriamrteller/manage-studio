import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { formatCurrency } from "../_shared/email-dist/format.js";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../_shared/email-send.ts";
import { resolveEnrolmentNotificationRecipient } from "../_shared/enrolment-recipient.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../_shared/notification-from.ts";
import {
  buildCardLinkEmailCopy,
  createCardLinkCharge,
  formatCardLinkMonth,
} from "../_shared/payments/card-link.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";

/**
 * Admin → student → active monthly enrolment → "Send card link" (payments B b). Creates the
 * provider's payment page for the month that is due, with "save this card" on, and emails it
 * to the parent. Grow and Takbull; see _shared/payments/card-link.ts.
 */
const BodySchema = z.object({ engagement_id: z.string().uuid() });

Deno.serve(withMonitoring("send-card-link", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role, email")
    .eq("id", auth.user.id)
    .single();
  if (!profile?.tenant_id || !Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }
  const tenantId = profile.tenant_id as string;

  // One link per enrolment per minute: the parent should not get a pile of emails.
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recent } = await service
    .from("audit_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("action", "admin.card_link_sent")
    .eq("entity_id", body.engagement_id)
    .gte("created_at", oneMinuteAgo)
    .limit(1)
    .maybeSingle();
  if (recent?.id) {
    return jsonResponse({ error: "Please wait before sending another card link for this enrolment." }, 429);
  }

  const result = await createCardLinkCharge(service, { tenantId, engagementId: body.engagement_id }, {
    createCharge: async (params) => (await getPaymentProviderForTenant(service, tenantId)).createCharge(params),
    priceMinor: (price) => resolveOfferingPrice({ price_minor: price }).totalMinor,
  });
  if (!result.ok) return jsonResponse({ error: result.error, code: result.code }, result.status);

  const [{ data: tenant }, { data: student }, { data: offering }] = await Promise.all([
    service
      .from("tenants")
      .select(`id, name, language_default, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
      .eq("id", tenantId)
      .single(),
    service.from("people").select("name").eq("id", result.personId).eq("tenant_id", tenantId).single(),
    service.from("offerings").select("name").eq("id", result.offeringId).single(),
  ]);

  const language = tenant?.language_default === "he" ? "he" : "en";
  const recipient = await resolveEnrolmentNotificationRecipient(service, tenantId, result.personId);
  const sender = (() => {
    try {
      return tenant ? resolveTenantSender(tenant as unknown as TenantSenderInput) : null;
    } catch {
      return null;
    }
  })();

  let emailSent = false;
  let emailError: string | null = null;
  if (!recipient?.email) {
    emailError = "No email address for this student or their parent";
  } else if (!sender || !tenant) {
    emailError = "Sender email is not configured";
  } else {
    const month = formatCardLinkMonth(result.period, language);
    const copy = buildCardLinkEmailCopy({
      language,
      studentName: (student?.name as string | undefined) ?? "",
      className: (offering?.name as string | undefined) ?? "",
      month,
    });
    const amount = formatCurrency(result.amountMinor, result.currency, language === "he" ? "he-IL" : "en-GB");
    try {
      await sendRenderedEmail({
        to: recipient.email,
        from: sender.from,
        replyTo: sender.replyTo,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER,
          language,
          schoolName: tenant.name as string,
          tenantColors: {
            primary_color: tenant.primary_color as string | null,
            accent_color: tenant.accent_color as string | null,
          },
          variables: {
            subject: copy.subject,
            recipientName: recipient.name ?? (student?.name as string | undefined) ?? "",
            enrolledClassName: (offering?.name as string | undefined) ?? "",
            description: copy.description,
            amountOutstandingFormatted: amount,
            amountFormatted: amount,
            paymentUrl: result.pageUrl,
            dueDate: month,
            intro: copy.intro,
            ctaButton: copy.ctaButton,
          },
        },
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Email delivery failed";
    }
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: auth.user.id,
    actor_email: (profile.email as string | null) ?? null,
    action: "admin.card_link_sent",
    entity_type: "engagement",
    entity_id: body.engagement_id,
    after_state: {
      period: result.period,
      amount_minor: result.amountMinor,
      recipient_email: recipient?.email ?? null,
      outcome: emailSent ? "sent" : "email_failed",
      email_error: emailError,
    },
  });

  return jsonResponse({
    ok: true,
    pageUrl: result.pageUrl,
    period: result.period,
    emailSent,
    ...(emailError ? { warning: emailError } : {}),
  });
}));

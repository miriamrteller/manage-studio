/**
 * send-waiver-reminder
 *
 * Invoked by pg_cron every 6 hours (see migration comment for schedule setup).
 * Also callable manually by admin as a POST with no body.
 *
 * Responsibilities:
 *   1. Send 5-day-before reminder email (first notice)
 *   2. Send 48-hour-before reminder email (final notice)
 *   3. Auto-cancel engagements past their deadline + issue Stripe refund if paid
 *
 * Processes LIMIT 100 records per run to avoid Edge Function timeouts.
 * If >100 records are found, it logs a warning — schedule should be made more
 * frequent or batch size increased.
 *
 * Security: This function may be invoked via pg_cron net.http_post with no auth
 * header.  It checks for CRON_SECRET env var.  Set via:
 *   supabase secrets set CRON_SECRET=<random-string>
 */

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  sendRenderedEmail,
  EMAIL_TEMPLATE_NAMES,
} from "../_shared/resend-send.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const BATCH_LIMIT = 100;

interface PendingEngagement {
  id: string;
  tenant_id: string;
  person_id: string;
  offering_id: string;
  waiver_deadline: string;
  waiver_48h_reminded_at: string | null;
  waiver_5d_reminded_at: string | null;
  people: {
    email: string | null;
    name: string | null;
    account_id: string | null;
  };
  offerings: {
    name: string | null;
  };
  tenants: {
    name: string | null;
    from_email: string | null;
    language_default: string | null;
    primary_color: string | null;
    accent_color: string | null;
  };
  payments: {
    stripe_payment_intent_id: string | null;
    total_amount_minor: number | null;
    currency: string | null;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Validate cron secret
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  if (
    CRON_SECRET &&
    authHeader !== `Bearer ${CRON_SECRET}` &&
    cronHeader !== CRON_SECRET
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const service = createServiceClient();
  const now = new Date();

  // Fetch pending_waiver engagements with deadline set, joined to all needed data
  const { data: engagements, error: fetchError } = await service
    .from("engagements")
    .select(
      `id, tenant_id, person_id, offering_id, waiver_deadline,
       waiver_48h_reminded_at, waiver_5d_reminded_at,
       people ( email, name, account_id ),
       offerings ( name ),
       tenants ( name, from_email, language_default, primary_color, accent_color ),
       payments ( stripe_payment_intent_id, total_amount_minor, currency )`,
    )
    .eq("status", "pending_waiver")
    .not("waiver_deadline", "is", null)
    .limit(BATCH_LIMIT);

  if (fetchError) {
    console.error("[send-waiver-reminder] fetch error:", fetchError);
    return jsonResponse({ error: fetchError.message }, 500);
  }

  const rows = (engagements ?? []) as unknown as PendingEngagement[];

  if (rows.length === BATCH_LIMIT) {
    console.warn(
      "[send-waiver-reminder] WARNING: query returned BATCH_LIMIT rows — " +
        "there may be more unprocessed records. Consider increasing run frequency.",
    );
  }

  const results: Record<string, string[]> = { cancelled: [], reminded_5d: [], reminded_48h: [], errors: [] };

  for (const eng of rows) {
    try {
      const deadline = new Date(eng.waiver_deadline);
      const msUntilDeadline = deadline.getTime() - now.getTime();
      const language = (eng.tenants?.language_default === "he" ? "he" : "en") as "en" | "he";
      const personEmail = eng.people?.email;
      const fromEmail = eng.tenants?.from_email;
      const recipientName = eng.people?.name ?? "there";
      const className = eng.offerings?.name ?? "your class";
      const schoolName = eng.tenants?.name ?? "Studio";

      // 1. Past deadline — cancel and refund
      if (msUntilDeadline <= 0) {
        let refundNote = "No payment was taken.";

        // Attempt Stripe refund if paid
        const payment = eng.payments;
        if (payment?.stripe_payment_intent_id && payment.total_amount_minor) {
          try {
            const { data: creds } = await service.rpc(
              "get_tenant_stripe_credentials",
              { p_tenant_id: eng.tenant_id },
            );
            if (creds?.[0]?.stripe_secret_key) {
              const stripe = new Stripe(
                (creds[0] as { stripe_secret_key: string }).stripe_secret_key,
                { apiVersion: "2023-10-16" },
              );
              await stripe.refunds.create(
                {
                  payment_intent: payment.stripe_payment_intent_id,
                  reason: "requested_by_customer",
                },
                {
                  idempotencyKey: `waiver-cancel-refund-${eng.id}`,
                },
              );
              refundNote = "A full refund has been issued to your original payment method.";
            }
          } catch (refundErr) {
            console.error(
              "[send-waiver-reminder] Stripe refund failed:",
              refundErr,
              { engagementId: eng.id },
            );
            refundNote = "Please contact us to arrange your refund.";
          }
        }

        // Mark engagement cancelled
        await service
          .from("engagements")
          .update({ status: "cancelled" })
          .eq("id", eng.id);

        // Insert waiver revoked event
        await service.from("waiver_events").insert({
          tenant_id: eng.tenant_id,
          person_id: eng.person_id,
          engagement_id: eng.id,
          event_type: "revoked",
          reason: "waiver_deadline_exceeded",
          occurred_at: new Date().toISOString(),
        }).catch((e) =>
          console.warn("[send-waiver-reminder] waiver_events insert failed:", e)
        );

        // Send cancellation email
        if (personEmail && fromEmail) {
          await sendRenderedEmail({
            to: personEmail,
            from: fromEmail,
            renderInput: {
              templateName: EMAIL_TEMPLATE_NAMES.WAIVER_CANCELLED,
              language,
              schoolName,
              tenantColors: {
                primary_color: eng.tenants?.primary_color,
                accent_color: eng.tenants?.accent_color,
              },
              variables: {
                recipientName,
                className,
                refundNote,
              },
            },
          }).catch((e) =>
            console.error("[send-waiver-reminder] cancel email failed:", e, { engagementId: eng.id })
          );
        }

        results.cancelled.push(eng.id);
        continue;
      }

      const MS_48H = 48 * 60 * 60 * 1000;
      const MS_5D  =  5 * 24 * 60 * 60 * 1000;

      // 2. 48-hour reminder (final notice, not yet sent)
      if (msUntilDeadline <= MS_48H && !eng.waiver_48h_reminded_at) {
        if (personEmail && fromEmail && APP_URL) {
          try {
            const { data: linkData } = await service.auth.admin.generateLink({
              type: "magiclink",
              email: personEmail,
              options: {
                redirectTo: `${APP_URL}/auth/callback?pendingWaiverEngagementId=${encodeURIComponent(eng.id)}`,
              },
            });
            const signUrl = linkData?.properties?.action_link ?? `${APP_URL}/enrol/complete?engagementId=${eng.id}`;

            await sendRenderedEmail({
              to: personEmail,
              from: fromEmail,
              renderInput: {
                templateName: EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER,
                language,
                schoolName,
                tenantColors: {
                  primary_color: eng.tenants?.primary_color,
                  accent_color: eng.tenants?.accent_color,
                },
                variables: {
                  recipientName,
                  className,
                  signUrl,
                  deadlineDate: eng.waiver_deadline,
                  isUrgent: true,
                },
              },
            });
          } catch (emailErr) {
            console.error("[send-waiver-reminder] 48h email failed:", emailErr, { engagementId: eng.id });
            results.errors.push(`${eng.id}: 48h email failed`);
          }
        }

        await service
          .from("engagements")
          .update({ waiver_48h_reminded_at: now.toISOString() })
          .eq("id", eng.id);

        results.reminded_48h.push(eng.id);
        continue;
      }

      // 3. 5-day reminder (first notice, not yet sent)
      if (msUntilDeadline <= MS_5D && !eng.waiver_5d_reminded_at) {
        if (personEmail && fromEmail && APP_URL) {
          try {
            const { data: linkData } = await service.auth.admin.generateLink({
              type: "magiclink",
              email: personEmail,
              options: {
                redirectTo: `${APP_URL}/auth/callback?pendingWaiverEngagementId=${encodeURIComponent(eng.id)}`,
              },
            });
            const signUrl = linkData?.properties?.action_link ?? `${APP_URL}/enrol/complete?engagementId=${eng.id}`;

            await sendRenderedEmail({
              to: personEmail,
              from: fromEmail,
              renderInput: {
                templateName: EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER,
                language,
                schoolName,
                tenantColors: {
                  primary_color: eng.tenants?.primary_color,
                  accent_color: eng.tenants?.accent_color,
                },
                variables: {
                  recipientName,
                  className,
                  signUrl,
                  deadlineDate: eng.waiver_deadline,
                  isUrgent: false,
                },
              },
            });
          } catch (emailErr) {
            console.error("[send-waiver-reminder] 5d email failed:", emailErr, { engagementId: eng.id });
            results.errors.push(`${eng.id}: 5d email failed`);
          }
        }

        await service
          .from("engagements")
          .update({ waiver_5d_reminded_at: now.toISOString() })
          .eq("id", eng.id);

        results.reminded_5d.push(eng.id);
      }
    } catch (engErr) {
      console.error("[send-waiver-reminder] unexpected error for engagement:", engErr, { engagementId: eng.id });
      results.errors.push(`${eng.id}: unexpected error`);
    }
  }

  console.log("[send-waiver-reminder] done:", results);
  return jsonResponse({ ok: true, processed: rows.length, results });
});

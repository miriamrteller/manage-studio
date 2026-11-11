/**
 * run-lead-followup-digest — daily pg_cron job (…_lead_followup_digest.sql).
 *
 * One email per studio admin listing the leads to follow up today: a follow-up
 * date today or earlier, still open (docs/plans/LEADS.md, step 4). Studios with
 * nothing due get no email. Admins who switched it off (lead_digest_optouts)
 * get none. Each digest is claimed in notification_log first (unique per
 * studio, recipient and day), so a retry or an overlapping run never sends
 * twice. Sent through sendHtmlEmail, so EMAIL_TRANSPORT applies.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET. Fails closed when unset.
 */
import { jsonResponse, internalError } from "../_shared/edge-runtime/cors.ts";
import { rejectUnlessCron } from "../_shared/edge-runtime/cron-auth.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { sendHtmlEmail } from "../_shared/email-client.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../_shared/notification-from.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { digestEmail, type DigestLead, dueLeads } from "../_shared/crm-contract/lead-digest.ts";
import { FORM_TIME_ZONE, todayIn } from "../_shared/email-dist/leadForm.js";

const TEMPLATE = "lead_followup_digest";

interface Admin {
  id: string;
  tenant_id: string;
  email: string | null;
  language: string | null;
}

Deno.serve(withMonitoring("run-lead-followup-digest", async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  const rootDomain = Deno.env.get("APP_ROOT_DOMAIN")?.trim();
  if (!rootDomain) return jsonResponse({ error: "APP_ROOT_DOMAIN is not configured" }, 500);

  const service = createServiceClient();
  const today = todayIn(FORM_TIME_ZONE);
  // A timestamp at the end of today in Israel is never more than a day past
  // midnight UTC of tomorrow, so filter generously here and exactly in dueLeads.
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86_400_000).toISOString();

  const { data: leadRows, error: leadError } = await service
    .from("leads")
    .select("id, tenant_id, name, stage, next_follow_up_at, converted_account_id, phone, email")
    .not("next_follow_up_at", "is", null)
    .lt("next_follow_up_at", until)
    .is("converted_account_id", null)
    .not("stage", "in", "(won,lost)")
    .order("next_follow_up_at", { ascending: true })
    .limit(10000);
  if (leadError) return internalError("run-lead-followup-digest", leadError);

  const byTenant = new Map<string, DigestLead[]>();
  for (const row of (leadRows ?? []) as Array<DigestLead & { tenant_id: string }>) {
    const list = byTenant.get(row.tenant_id) ?? [];
    list.push(row);
    byTenant.set(row.tenant_id, list);
  }
  for (const [tenantId, list] of byTenant) {
    // Follow-up dates come from a date picker (stored at midnight UTC), so the
    // date part is the day the studio chose.
    const due = dueLeads(list, today);
    if (due.length === 0) byTenant.delete(tenantId);
    else byTenant.set(tenantId, due);
  }
  const tenantIds = [...byTenant.keys()];
  if (tenantIds.length === 0) return jsonResponse({ studios: 0, sent: 0 });

  const [{ data: tenants }, { data: admins }, { data: optouts }] = await Promise.all([
    service.from("tenants").select(`id, name, language_default, ${TENANT_SENDER_COLUMNS}`).in("id", tenantIds),
    service.from("user_profiles").select("id, tenant_id, email, language").in("tenant_id", tenantIds).contains("role", ["tenant_admin"]).eq("is_platform_support", false),
    service.from("lead_digest_optouts").select("user_id").in("tenant_id", tenantIds),
  ]);
  const optedOut = new Set(((optouts ?? []) as Array<{ user_id: string }>).map((o) => o.user_id));
  const tenantById = new Map(((tenants ?? []) as Array<{ id: string } & Record<string, unknown>>).map((t) => [t.id, t]));

  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const admin of (admins ?? []) as Admin[]) {
    const tenant = tenantById.get(admin.tenant_id);
    const leads = byTenant.get(admin.tenant_id);
    const email = admin.email?.trim().toLowerCase();
    if (!tenant || !leads || !email || optedOut.has(admin.id)) {
      counts.skipped += 1;
      continue;
    }
    const lang = (admin.language ?? tenant.language_default) === "he" ? "he" : "en";
    const base = `https://${tenant.subdomain}.${rootDomain}`;
    const built = digestEmail({
      studio: (tenant.name as string) || (tenant.subdomain as string),
      leads,
      today,
      leadsUrl: `${base}/admin/leads`,
      settingsUrl: `${base}/admin/setup/settings`,
      lang,
    });

    // Claim first: the unique index makes a second claim for the same day fail.
    const { data: claim, error: claimError } = await service
      .from("notification_log")
      .insert({
        tenant_id: admin.tenant_id,
        recipient_email: email,
        channel: "email",
        template_name: TEMPLATE,
        subject: built.subject,
        status: "pending",
        variables: { digest_date: today, lead_count: leads.length },
      })
      .select("id")
      .single();
    if (claimError || !claim) {
      counts.skipped += 1; // already sent today (unique violation) or not claimable
      continue;
    }

    try {
      const sender = resolveTenantSender(tenant as unknown as TenantSenderInput);
      const sent = await sendHtmlEmail({
        to: email,
        from: sender.from,
        replyTo: sender.replyTo,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
      await service.from("notification_log")
        .update({ status: "sent", sent_at: new Date().toISOString(), external_msg_id: sent.id ?? null })
        .eq("id", (claim as { id: string }).id);
      counts.sent += 1;
    } catch (err) {
      console.error(`[run-lead-followup-digest] ${admin.tenant_id}:`, err);
      await service.from("notification_log")
        .update({ status: "failed", failure_reason: String(err).slice(0, 500) })
        .eq("id", (claim as { id: string }).id);
      counts.failed += 1;
    }
  }

  console.log("[run-lead-followup-digest]", JSON.stringify({ today, studios: tenantIds.length, ...counts }));
  return jsonResponse({ today, studios: tenantIds.length, ...counts });
}));


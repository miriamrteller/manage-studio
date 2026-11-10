import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { rejectUnlessCron } from "../_shared/edge-runtime/cron-auth.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { sendHtmlEmail } from "../_shared/email-client.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { declineEmail, type DeclineEmail, runPlatformBilling } from "../_shared/payments/takbull/platform-billing-charge.ts";
import { tenantBaseUrlFor } from "../_shared/tenant-url.ts";

/**
 * OpalSwift's own billing, step B3: the monthly charge on each studio's saved card
 * (_shared/payments/takbull/platform-billing-charge.ts).
 *
 * - Daily pg_cron job (x-cron-secret / Bearer CRON_SECRET): every due studio.
 * - The platform owner (super_admin JWT) with { tenant_id }: "Charge now (testing)" in
 *   Platform → Billing, for that studio only, without waiting for its date.
 * Either way nothing is charged unless the owner switched charging on, and a month already
 * paid is never charged again.
 */
Deno.serve(withMonitoring("run-platform-billing", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const service = createServiceClient();
  let tenantId: string | undefined;
  if (req.headers.get("x-cron-secret")) {
    const denied = rejectUnlessCron(req);
    if (denied) return denied;
  } else {
    const auth = await requireAuthUser(req);
    if ("error" in auth) {
      // Not a signed-in user: maybe the cron secret sent as a Bearer token.
      const denied = rejectUnlessCron(req);
      if (denied) return denied;
    } else {
      const { data: profile } = await service.from("user_profiles").select("role").eq("id", auth.user.id).single();
      if (!Array.isArray(profile?.role) || !profile.role.includes("super_admin")) {
        return jsonResponse({ error: "platform owner only" }, 403);
      }
      const body = await req.json().catch(() => null) as { tenant_id?: unknown } | null;
      if (typeof body?.tenant_id !== "string" || !body.tenant_id) return jsonResponse({ error: "tenant_id is required" }, 400);
      tenantId = body.tenant_id;
    }
  }

  const result = await runPlatformBilling(
    service,
    tenantId ? { tenantId, force: true } : {},
    { notifyDeclined: (email) => sendDeclineEmails(service, email) },
  );
  if (!result.ok) return jsonResponse({ ok: false, code: result.code }, tenantId ? 409 : 200);
  const counts: Record<string, number> = {};
  for (const s of result.studios) counts[s.result] = (counts[s.result] ?? 0) + 1;
  return jsonResponse({ ok: true, counts, studios: tenantId ? result.studios : undefined });
}));

/** Emails each admin of the studio, from OpalSwift, in their own language. */
async function sendDeclineEmails(service: ReturnType<typeof createServiceClient>, email: DeclineEmail): Promise<void> {
  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  if (!from) {
    console.error("run-platform-billing: NOTIFICATION_FROM_EMAIL is not set; decline email not sent");
    return;
  }
  const replyTo = Deno.env.get("SUPPORT_EMAIL")?.trim() || "support@opalswift.com";
  const [{ data: tenant }, { data: admins }] = await Promise.all([
    service.from("tenants").select("name, language_default").eq("id", email.tenantId).single(),
    service.from("user_profiles").select("email, language").eq("tenant_id", email.tenantId).contains("role", ["tenant_admin"]),
  ]);
  const settingsUrl = `${(await tenantBaseUrlFor(service, email.tenantId)).replace(/\/+$/, "")}/admin/setup/payments`;
  for (const admin of (admins ?? []) as Array<{ email: string | null; language: string | null }>) {
    if (!admin.email) continue;
    const language = (admin.language ?? tenant?.language_default) === "en" ? "en" : "he";
    const message = declineEmail({
      language,
      studioName: (tenant?.name as string | undefined) ?? "",
      amountAgorot: email.amountAgorot,
      nextTryOn: email.nextTryOn,
      settingsUrl,
    });
    await sendHtmlEmail({ to: admin.email, from, replyTo, subject: message.subject, html: message.html });
  }
}

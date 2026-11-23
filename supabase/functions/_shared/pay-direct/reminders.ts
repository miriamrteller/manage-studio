/**
 * Payment screenshot reminders outside the photo shop (owner, 23 Nov 2026: "yes").
 *
 * A client opened a payment page (/pay link or the enrolment / booking pay step) while the
 * studio offered Bit or bank transfer: client-pay-direct marked the row proof_requested.
 * Until a screenshot arrives, the client picks cash / cheque, or the studio records the
 * payment, the client gets a reminder at 1, 3 and 7 days (as photo orders). Never cancels,
 * holds or blocks anything. Hourly-or-faster from expire-scheduling-holds; counted before
 * sending, so a failed send never repeats every run.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency } from "../email-dist/format.js";
import { announcementAlreadySent, sendLoggedAnnouncement } from "../logged-announcement.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import { TENANT_SENDER_COLUMNS } from "../notification-from.ts";
import { tenantBaseUrl } from "../tenant-url.ts";
import { buildEnrolmentPayUrl } from "../enrolment-pay-url.ts";
import { payDirectWaysText, studioPayDirect } from "../photo-shop/pay-direct.ts";
import { PROOF_REMINDER_DAYS, proofReminderDue } from "../photo-shop/payment-proof.ts";
import { buildClientPaymentProofReminderEmail } from "./email-copy.ts";

interface DueRow {
  id: string;
  tenant_id: string;
  payment_request_id: string | null;
  engagement_id: string | null;
  pay_method: string | null;
  created_at: string;
  proof_reminders_sent: number;
}

/** What to remind about, or null when it no longer needs paying. */
async function loadTarget(service: SupabaseClient, r: DueRow, tenant: Record<string, unknown>) {
  const base = tenantBaseUrl(tenant as unknown as { subdomain: string; custom_domain?: string | null });
  if (r.payment_request_id) {
    const { data: req } = await service
      .from("job_payment_requests")
      .select("engagement_id, label, amount_minor, currency, status, public_token")
      .eq("id", r.payment_request_id)
      .maybeSingle();
    if (!req || (req.status !== "pending" && req.status !== "sent")) return null;
    const { data: eng } = await service
      .from("engagements").select("person_id, status").eq("id", req.engagement_id as string).maybeSingle();
    if (!eng?.person_id || eng.status === "cancelled" || eng.status === "withdrawn") return null;
    return {
      personId: eng.person_id as string,
      what: (req.label as string) ?? "",
      amountMinor: req.amount_minor as number,
      currency: req.currency as string,
      payUrl: async (_email: string) => `${base}/pay/${req.public_token as string}`,
    };
  }
  if (r.engagement_id) {
    const { data: eng } = await service
      .from("engagements").select("id, person_id, offering_id, status").eq("id", r.engagement_id).maybeSingle();
    if (!eng?.person_id || eng.status !== "pending_payment") return null;
    const { data: offering } = await service.from("offerings").select("name").eq("id", eng.offering_id as string).maybeSingle();
    return {
      personId: eng.person_id as string,
      what: (offering?.name as string | undefined) ?? "",
      amountMinor: null as number | null,
      currency: null as string | null,
      payUrl: async (email: string) =>
        (await buildEnrolmentPayUrl(service, {
          appBaseUrl: base,
          engagementId: eng.id as string,
          tenantId: r.tenant_id,
          recipientEmail: email,
        })).paymentUrl,
    };
  }
  return null;
}

/** Returns how many reminders were sent. */
export async function remindClientPaymentProofs(service: SupabaseClient, now = new Date()): Promise<number> {
  const { data: due, error } = await service
    .from("client_payment_proofs")
    .select("id, tenant_id, payment_request_id, engagement_id, pay_method, created_at, proof_reminders_sent")
    .eq("proof_requested", true)
    .is("proof_path", null)
    .lt("proof_reminders_sent", PROOF_REMINDER_DAYS.length)
    .lte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .limit(200);
  if (error) {
    console.error("[payment-proof-reminders] load failed", error.message);
    return 0;
  }
  let sent = 0;
  for (const r of (due ?? []) as DueRow[]) {
    const n = Number(r.proof_reminders_sent ?? 0);
    if (!proofReminderDue(r.created_at, n, now)) continue;
    // The client picked cash or cheque: no screenshot to ask for.
    if (r.pay_method === "cash" || r.pay_method === "cheque") continue;
    try {
      const { data: tenantRow } = await service
        .from("tenants")
        .select(`id, name, language_default, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
        .eq("id", r.tenant_id)
        .maybeSingle();
      if (!tenantRow) continue;
      const tenant = tenantRow as unknown as Record<string, unknown>;
      const target = await loadTarget(service, r, tenant);
      // Counted first, so a failed send never repeats every run. Paid / cancelled: stop.
      await service.from("client_payment_proofs")
        .update(target
          ? { proof_reminders_sent: n + 1, proof_reminded_at: now.toISOString() }
          : { proof_requested: false })
        .eq("id", r.id)
        .eq("proof_reminders_sent", n);
      if (!target) continue;
      const key = `payment_proof:${r.id}:reminder:${n + 1}`;
      if (await announcementAlreadySent(service, r.tenant_id, key)) continue;
      const recipient = await resolveEnrolmentNotificationRecipient(service, r.tenant_id, target.personId);
      if (!recipient) continue;
      const language = tenant.language_default === "en" ? "en" : "he";
      const pay = await studioPayDirect(service, r.tenant_id);
      const email = buildClientPaymentProofReminderEmail({
        language,
        studioName: (tenant.name as string) ?? "",
        what: target.what,
        totalFormatted: target.amountMinor && target.currency
          ? formatCurrency(target.amountMinor, target.currency, language === "he" ? "he-IL" : "en-GB")
          : "",
        ways: payDirectWaysText(language, pay),
        payUrl: await target.payUrl(recipient.email),
      });
      if (
        await sendLoggedAnnouncement(service, {
          tenant,
          tenantId: r.tenant_id,
          to: recipient.email,
          personId: recipient.personId,
          key,
          templateName: "payment_proof_reminder",
          ...email,
          variables: { payment_proof_id: r.id },
        })
      ) sent += 1;
    } catch (e) {
      console.error("[payment-proof-reminders] reminder failed", r.id, String(e));
    }
  }
  return sent;
}

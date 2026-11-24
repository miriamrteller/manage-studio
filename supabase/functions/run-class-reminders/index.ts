/**
 * run-class-reminders — daily pg_cron job (…_class_reminders.sql), early morning in Israel.
 *
 * For each studio that switched them on (tenants.class_reminders):
 *  - morning: today's class reminder to each enrolled family, with the time,
 *    where (the class's location) and what to wear;
 *  - no_class: 6 days ahead (the day after the previous weekly class), "no class on <day>" when the class would meet
 *    that day but it is a skipped holiday or one of the studio's closed dates.
 *
 * Sent to the family's account contact, in their language (contact
 * preferences, else the studio's). Skips anyone who opted out of email; the
 * no-class notice also honours "class cancellations" off. Each email is
 * claimed in notification_log first (unique per studio, recipient, kind, date
 * and enrolment), so a retry or an overlapping run never sends twice.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET. Fails closed when unset.
 */
import { internalError, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { rejectUnlessCron } from "../_shared/edge-runtime/cron-auth.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../_shared/email-send.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../_shared/notification-from.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { isSkippedHolidayIsoDate } from "../_shared/holidays.ts";
import { FORM_TIME_ZONE, todayIn } from "../_shared/email-dist/leadForm.js";
import {
  addDays,
  classOnDate,
  morningReminderEmail,
  noClassEmail,
  parseClassReminders,
  type ReminderOffering,
  type ReminderSession,
} from "../_shared/class-reminders.ts";

const MORNING = "class_reminder_morning";
const NO_CLASS = "class_no_class_notice";
// 6, not 7: a weekly class's notice goes out the day after the previous
// class (Wednesday class -> Thursday notice), not on class day itself.
const NOTICE_DAYS_AHEAD = 6;
const ENROLLED = ["active", "pending_payment"];

interface TenantRow extends Record<string, unknown> {
  id: string;
  name: string;
  language_default: string | null;
  primary_color: string | null;
  accent_color: string | null;
  class_reminders: unknown;
}

Deno.serve(withMonitoring("run-class-reminders", async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const service = createServiceClient();
  const today = todayIn(FORM_TIME_ZONE);
  const noticeDate = addDays(today, NOTICE_DAYS_AHEAD);

  const { data: tenantRows, error: tenantError } = await service
    .from("tenants")
    .select(`id, name, language_default, primary_color, accent_color, class_reminders, ${TENANT_SENDER_COLUMNS}`)
    .or("class_reminders->>morning.eq.true,class_reminders->>no_class.eq.true");
  if (tenantError) return internalError("run-class-reminders", tenantError);

  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const tenant of (tenantRows ?? []) as TenantRow[]) {
    try {
      await runTenant(service, tenant, today, noticeDate, counts);
    } catch (err) {
      console.error(`[run-class-reminders] ${tenant.id}:`, err);
      counts.failed += 1;
    }
  }
  return jsonResponse({ studios: (tenantRows ?? []).length, ...counts });
}));

type Service = ReturnType<typeof createServiceClient>;

async function runTenant(
  service: Service,
  tenant: TenantRow,
  today: string,
  noticeDate: string,
  counts: { sent: number; skipped: number; failed: number },
): Promise<void> {
  const config = parseClassReminders(tenant.class_reminders);
  const closed = new Set(config.closed_dates);
  const isOff = (date: string) => closed.has(date) || isSkippedHolidayIsoDate(date);

  const { data: offeringRows, error: offeringError } = await service
    .from("offerings")
    .select("id, name, day_of_week, start_time, end_time, location, seasons(start_date, end_date)")
    .eq("tenant_id", tenant.id)
    .eq("status", "active");
  if (offeringError) throw offeringError;
  const offerings: ReminderOffering[] = ((offeringRows ?? []) as Array<Record<string, unknown>>).map((o) => {
    const season = (Array.isArray(o.seasons) ? o.seasons[0] : o.seasons) as
      | { start_date: string | null; end_date: string | null }
      | null;
    return {
      id: o.id as string,
      name: o.name as string,
      day_of_week: (o.day_of_week as number | null) ?? null,
      start_time: (o.start_time as string | null) ?? null,
      end_time: (o.end_time as string | null) ?? null,
      location: (o.location as string | null) ?? null,
      season_start: season?.start_date ?? null,
      season_end: season?.end_date ?? null,
    };
  });
  if (offerings.length === 0) return;

  const { data: sessionRows } = await service
    .from("offering_sessions")
    .select("offering_id, session_date, start_time, end_time")
    .eq("tenant_id", tenant.id)
    .in("session_date", [today, noticeDate]);
  const sessions = (sessionRows ?? []) as ReminderSession[];

  // What to send: [kind, date, offering, start, end]
  const jobs: Array<{ kind: string; date: string; offering: ReminderOffering; start: string; end: string | null }> = [];
  for (const o of offerings) {
    if (config.morning) {
      const c = classOnDate(o, today, sessions, isOff);
      if (c && !c.off) jobs.push({ kind: MORNING, date: today, offering: o, start: c.occurrence.start_time, end: c.occurrence.end_time });
    }
    if (config.no_class) {
      const c = classOnDate(o, noticeDate, sessions, isOff);
      if (c && c.off) jobs.push({ kind: NO_CLASS, date: noticeDate, offering: o, start: c.occurrence.start_time, end: c.occurrence.end_time });
    }
  }
  if (jobs.length === 0) return;

  const offeringIds = [...new Set(jobs.map((j) => j.offering.id))];
  const { data: engagementRows, error: engagementError } = await service
    .from("engagements")
    .select("id, offering_id, person_id")
    .eq("tenant_id", tenant.id)
    .in("offering_id", offeringIds)
    .in("status", ENROLLED);
  if (engagementError) throw engagementError;
  const engagements = (engagementRows ?? []) as Array<{ id: string; offering_id: string; person_id: string }>;
  if (engagements.length === 0) return;

  const { data: studentRows } = await service
    .from("people")
    .select("id, name, account_id")
    .eq("tenant_id", tenant.id)
    .in("id", [...new Set(engagements.map((e) => e.person_id))]);
  const students = new Map(((studentRows ?? []) as Array<{ id: string; name: string | null; account_id: string | null }>).map((p) => [p.id, p]));

  const accountIds = [...new Set([...students.values()].map((s) => s.account_id).filter((id): id is string => Boolean(id)))];
  const { data: accountRows } = accountIds.length
    ? await service.from("accounts").select("id, person_id").eq("tenant_id", tenant.id).in("id", accountIds)
    : { data: [] };
  const accounts = new Map(((accountRows ?? []) as Array<{ id: string; person_id: string | null }>).map((a) => [a.id, a]));

  const contactIds = [...new Set([...accounts.values()].map((a) => a.person_id).filter((id): id is string => Boolean(id)))];
  const [{ data: contactRows }, { data: prefRows }] = contactIds.length
    ? await Promise.all([
      service.from("people").select("id, name, email").eq("tenant_id", tenant.id).in("id", contactIds),
      service
        .from("contact_preferences")
        .select("person_id, email_opted_in, notify_offering_cancellation, language")
        .eq("tenant_id", tenant.id)
        .is("account_member_id", null)
        .in("person_id", contactIds),
    ])
    : [{ data: [] }, { data: [] }];
  const contacts = new Map(((contactRows ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((p) => [p.id, p]));
  const prefs = new Map(
    ((prefRows ?? []) as Array<{ person_id: string; email_opted_in: boolean; notify_offering_cancellation: boolean; language: string | null }>)
      .map((p) => [p.person_id, p]),
  );

  const sender = resolveTenantSender(tenant as unknown as TenantSenderInput);

  for (const job of jobs) {
    for (const engagement of engagements.filter((e) => e.offering_id === job.offering.id)) {
      const student = students.get(engagement.person_id);
      const account = student?.account_id ? accounts.get(student.account_id) : undefined;
      const contact = account?.person_id ? contacts.get(account.person_id) : undefined;
      const email = contact?.email?.trim().toLowerCase();
      const pref = contact ? prefs.get(contact.id) : undefined;
      if (!contact || !email || pref?.email_opted_in === false || (job.kind === NO_CLASS && pref?.notify_offering_cancellation === false)) {
        counts.skipped += 1;
        continue;
      }
      const lang: "en" | "he" = (pref?.language ?? tenant.language_default) === "he" ? "he" : "en";
      const built = job.kind === MORNING
        ? morningReminderEmail({
          lang,
          parentName: contact.name,
          studentName: student?.name ?? null,
          className: job.offering.name,
          date: job.date,
          startTime: job.start,
          endTime: job.end,
          location: job.offering.location,
          wear: lang === "he" ? config.wear_he || config.wear_en : config.wear_en || config.wear_he,
          studio: tenant.name,
        })
        : noClassEmail({
          lang,
          parentName: contact.name,
          studentName: student?.name ?? null,
          className: job.offering.name,
          date: job.date,
          studio: tenant.name,
        });

      // Claim first: the unique index makes a second claim for the same email fail.
      const { data: claim, error: claimError } = await service
        .from("notification_log")
        .insert({
          tenant_id: tenant.id,
          recipient_person_id: contact.id,
          recipient_email: email,
          channel: "email",
          template_name: job.kind,
          subject: built.subject,
          body_preview: built.body.slice(0, 200),
          status: "pending",
          variables: { class_date: job.date, engagement_id: engagement.id, offering_id: job.offering.id },
        })
        .select("id")
        .single();
      if (claimError || !claim) {
        counts.skipped += 1;
        continue;
      }

      try {
        const sent = await sendRenderedEmail({
          to: email,
          from: sender.from,
          replyTo: sender.replyTo,
          subject: built.subject,
          renderInput: {
            templateName: EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT,
            language: lang,
            schoolName: tenant.name,
            tenantColors: {
              primary_color: tenant.primary_color ?? undefined,
              accent_color: tenant.accent_color ?? undefined,
            },
            variables: { subject: built.subject, body: built.body },
          },
        });
        await service.from("notification_log")
          .update({ status: "sent", sent_at: new Date().toISOString(), external_msg_id: sent.id ?? null })
          .eq("id", (claim as { id: string }).id);
        counts.sent += 1;
      } catch (err) {
        console.error(`[run-class-reminders] ${tenant.id} ${job.kind}:`, err);
        await service.from("notification_log")
          .update({ status: "failed", failure_reason: String(err).slice(0, 500) })
          .eq("id", (claim as { id: string }).id);
        counts.failed += 1;
      }
    }
  }
}

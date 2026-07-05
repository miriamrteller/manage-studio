# Phase 1E — Recurring billing dunning emails (paste into new agent chat)

**Status:** **Ready** for automated implementation (2026-07-05)

## Mission

Wire **`PAYMENT_REMINDER`** emails when **monthly renewal charges fail** (`billing_schedules` dunning ladder). Retry timing and suspend logic already ship in `handle-payment-event.ts` and `renewal-billing.ts` — this plan adds **payer notification** (+ audit) on each failed attempt and on final suspend.

**Repo:** `manage-studio`  
**SPEC:** Phase 1E dunning · [finance/stage-6-recurring-billing.md](finance/stage-6-recurring-billing.md)  
**Branch:** branch from `main`  
**Depends on:** `billing_schedules` ✅ · `dunningNextAttemptAt` ✅ · `PAYMENT_REMINDER` template + `renderPaymentReminderHtml` ✅ · `resolveEnrolmentNotificationRecipient` ✅ · Resend pipeline ✅  
**Out of scope:** WhatsApp dunning · new email templates · automated `pending_payment` Day 3/7/14 cron (§6.x #8) · admin blast · Stripe dashboard Smart Retries · enrolment cancel on suspend

---

## External dependencies

| Service | Required? | Notes |
| --- | --- | --- |
| **Resend** (`RESEND_API_KEY`, tenant `from_email`) | **Yes** for live send smoke | Same as enrolment / admin link emails |
| **Twilio** | **No** | WhatsApp deferred |
| New env vars | **No** | Uses existing `APP_URL` |

Unit tests run **without** Resend (mock `sendRenderedEmail`).

---

## Current state (verified 2026-07-05)

| Item | Status |
| --- | --- |
| Dunning ladder (Day 4 / Day 8 retries) | ✅ `dunningNextAttemptAt` in `billing-time.ts` |
| `run-monthly-billing` cron | ✅ Calls `processBillingSchedule` |
| Failure → schedule update | ✅ `handle-payment-event.ts` (`payment.failed`, `charge_type=renewal`) |
| Failure → schedule update (API throw) | ✅ `renewal-billing.ts` catch block |
| Third failure → `billing_status=suspended` | ✅ Both paths |
| **`PAYMENT_REMINDER` on failure** | ❌ Not called |
| Admin suspend notification | ❌ Audit only today |
| `pending_payment` auto dunning | ❌ Manual `send-admin-enrolment-link` only |

---

## Locked semantics (V1)

| Rule | Value |
| --- | --- |
| **Scope** | **`charge_type === 'renewal'`** failures only (recurring monthly billing) |
| **Trigger** | After schedule row updated with new `attempt_count` (1 or 2 = retry; 3 = suspended) |
| **Recipient** | `resolveEnrolmentNotificationRecipient(tenantId, engagement.person_id)` |
| **Respect opt-out** | Skip send if guardian has `contact_preferences.email_opted_in === false` (no row = send) |
| **Template** | Existing `EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER` — no new React template |
| **CTA URL** | `${APP_URL}/dashboard/portal` (parent portal; signed-in pay / card update) |
| **Copy by attempt** | Attempt **1–2:** standard reminder intro + `dueDate` = formatted `next_attempt_at` from schedule update. Attempt **3 (suspended):** use `daysSinceOverdue: 8` + `intro_overdue` strings from i18n JSON via `renderPaymentReminderHtml` / pass through `variables.intro` override |
| **Amount** | `resolveOfferingPrice(offering.price_minor)` for current catalogue price (same as renewal charge) |
| **Idempotency** | Before send, query `audit_log` for `action='renewal.dunning_email_sent'` + `entity_id=billing_schedule_id` + `after_state.attempt_count` matching current attempt — skip if exists |
| **Audit success** | Insert `audit_log` `renewal.dunning_email_sent` with `{ attempt_count, recipient_email, engagement_id }` |
| **Audit skip/fail** | `renewal.dunning_email_skipped` / `renewal.dunning_email_failed` with reason |
| **`notification_log`** | **Optional V1** — do **not** block on it; audit_log is SSOT for this feature |
| **Admin email on suspend** | **Out of scope** — suspend already visible in admin finance; no new admin template in V1 |

---

## Hard rules

1. **No SQL migration.**
2. **Single shared module** — do not duplicate email logic in two files.
3. Call the shared helper from **both** failure paths after schedule update succeeds.
4. **Do not** change dunning timing (`dunningNextAttemptAt`) or suspend thresholds.
5. Email send failures must **not** roll back schedule updates (log + continue).
6. Run `pnpm -C apps/web test billing-time.test.ts provider-isolation-renewal-refund.test.ts` + new test file.
7. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `supabase/functions/_shared/payments/handle-payment-event.ts` — renewal failure branch (~L14–48)
2. `supabase/functions/_shared/payments/renewal-billing.ts` — catch block (~L293–343)
3. `supabase/functions/_shared/payments/billing-time.ts` — `dunningNextAttemptAt`
4. `supabase/functions/_shared/enrolment-payment-email.ts` — copy helpers pattern
5. `supabase/functions/_shared/enrolment-recipient.ts` — `resolveEnrolmentNotificationRecipient`
6. `supabase/functions/_shared/render-payment-email.ts` + `resend-send.ts` — `PAYMENT_REMINDER` path
7. `supabase/functions/send-admin-enrolment-link/index.ts` — reference send block (~L174–201)
8. `docs/plans/finance/stage-6-recurring-billing.md` — locked ladder policy
9. `packages/shared/src/i18n/email-templates-en.json` — `payment_reminder.intro_overdue`

---

## Step 1 — Shared helper: `send-renewal-dunning-reminder.ts`

**File:** `supabase/functions/_shared/payments/send-renewal-dunning-reminder.ts`

**Export:**

```ts
export async function sendRenewalDunningReminder(
  service: SupabaseClient,
  input: {
    tenantId: string;
    engagementId: string;
    billingScheduleId: string;
    attemptCount: number; // 1 | 2 | 3 after this failure
    nextAttemptAt: string | null; // null when suspended
    lastError?: string | null;
  },
): Promise<{ sent: boolean; skipped?: string }>
```

**Implementation outline:**

1. **Idempotency check** — `audit_log` query as locked above.
2. Load **tenant** (`name`, `language_default`, `from_email`, colors), **engagement** (`person_id`, `offering_id`), **offering** (`name`, `price_minor`, `currency`).
3. Resolve recipient via `resolveEnrolmentNotificationRecipient`.
4. Check `contact_preferences.email_opted_in` for recipient person (join via account holder if needed — mirror blast eligibility pattern in `send-notification`).
5. `resolveNotificationFromEmail(tenant.from_email)` — on missing sender, audit skip and return.
6. Build copy:
   - Add `buildRenewalDunningEmailCopy({ language, attemptCount, className, studentName, nextAttemptAt })` in `enrolment-payment-email.ts` (or colocated in helper file if cleaner).
   - EN attempt 1: *"We couldn't process your monthly payment for {class}. We'll retry on {date}."*
   - EN attempt 3: *"Your enrollment billing is suspended after 3 failed payment attempts. Please update your payment method in the portal."*
   - Mirror HE strings.
7. `paymentUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "") + "/dashboard/portal"` — if empty, still send with `#` and audit warning in `after_state`.
8. `sendRenderedEmail({ templateName: PAYMENT_REMINDER, ... })` matching `send-admin-enrolment-link` variables shape.
9. Audit success / catch failure.

---

## Step 2 — Extract schedule update + notify (avoid drift)

**File:** `supabase/functions/_shared/payments/apply-renewal-dunning-failure.ts`

**Export:**

```ts
export async function applyRenewalDunningFailure(
  service: SupabaseClient,
  input: {
    billingScheduleId: string;
    engagementId: string;
    tenantId: string;
    previousAttemptCount: number;
    failureMessage: string;
  },
): Promise<{ attemptCount: number; nextAttemptAt: string | null; suspended: boolean }>
```

Move the **existing** update logic (increment attempt, set `next_attempt_at` or suspend) from both call sites into this function. At end, call `sendRenewalDunningReminder`.

This guarantees one code path for timing + email.

---

## Step 3 — Wire call sites

### 3a — `handle-payment-event.ts`

Replace inline renewal failure block with:

```ts
await applyRenewalDunningFailure(service, {
  billingScheduleId: metadata.billing_schedule_id,
  engagementId: metadata.engagement_id,
  tenantId: metadata.tenant_id,
  previousAttemptCount: schedule?.attempt_count ?? 0,
  failureMessage: event.failureMessage ?? "Payment failed",
});
```

### 3b — `renewal-billing.ts`

Replace catch-block schedule update with same `applyRenewalDunningFailure` call (`tenantId` from `schedule.tenant_id`).

---

## Step 4 — Tests

**File:** `apps/web/src/__tests__/renewal-dunning-email.test.ts`

Use vi.mock on `sendRenderedEmail` / `resend-send.ts`:

| Case | Assert |
| --- | --- |
| Attempt 1 failure | Schedule `attempt_count=1`, `next_attempt_at` set, email mocked once, audit `renewal.dunning_email_sent` |
| Attempt 3 failure | Schedule `status=suspended`, engagement `billing_status=suspended`, email with suspend copy |
| Idempotency | Second call same attempt → no second email |
| Missing recipient | Audit `renewal.dunning_email_skipped`, no throw |
| `email_opted_in=false` | Skip send |

Reuse patterns from `provider-isolation-renewal-refund.test.ts` for Supabase mock client if needed.

---

## Step 5 — Docs

Update `docs/IMPLEMENTATION_STATUS.md`:

- Recurring billing dunning emails → ✅ (after implementation)
- Phase 1E remaining: note manual smoke with mock renewal failure

---

## Manual smoke (post-impl)

1. Tenant with recurring offering + saved mock token + active `billing_schedules` row.
2. Force renewal failure (mock provider decline or `payment.failed` webhook with renewal metadata).
3. Confirm payer receives `PAYMENT_REMINDER` Resend delivery.
4. Confirm `audit_log` row `renewal.dunning_email_sent`.
5. Repeat until attempt 3 → verify suspend + final email tone.

---

## Definition of done

- [ ] `applyRenewalDunningFailure` single path for schedule + email
- [ ] Both `handle-payment-event` and `renewal-billing` use it
- [ ] Idempotent per `(billing_schedule_id, attempt_count)`
- [ ] EN + HE copy for attempts 1–3
- [ ] Unit tests green
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated
- [ ] No migration

---

## File checklist

| Action | Path |
| --- | --- |
| Add | `supabase/functions/_shared/payments/apply-renewal-dunning-failure.ts` |
| Add | `supabase/functions/_shared/payments/send-renewal-dunning-reminder.ts` |
| Edit | `supabase/functions/_shared/enrolment-payment-email.ts` (renewal copy helpers) |
| Edit | `supabase/functions/_shared/payments/handle-payment-event.ts` |
| Edit | `supabase/functions/_shared/payments/renewal-billing.ts` |
| Add | `apps/web/src/__tests__/renewal-dunning-email.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Out of scope (explicit deferrals)

| Item | Track | Notes |
| --- | --- | --- |
| Automated `pending_payment` Day 3/7/14 | Track B | §6.x #8 — admin uses `send-admin-enrolment-link` today |
| WhatsApp `payment_reminder` | — | Twilio deferred |
| `payment_reminder_urgent` separate template | — | Use `intro_overdue` / attempt-3 copy on same template |
| Cancel enrolment on suspend | — | SPEC V2; suspend + manual admin action |
| `notification_log` rows | — | Optional follow-up |

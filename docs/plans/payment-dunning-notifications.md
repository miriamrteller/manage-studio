# Phase 1E — Billing-schedule dunning notifications (paste into new agent chat)

**Status:** **Ready** for automated implementation (2026-07-05, hardened for provider decoupling)

## Mission

Wire **`PAYMENT_REMINDER`** emails when a **`billing_schedules`** row enters a failed-attempt state (recurring monthly billing dunning ladder). Retry timing and suspend logic already ship — this plan **consolidates all failure entry points** into one provider-agnostic module and adds payer notification.

**Repo:** `manage-studio`  
**SPEC:** Phase 1E dunning · [finance/stage-6-recurring-billing.md](finance/stage-6-recurring-billing.md)  
**Branch:** branch from `main`  
**Depends on:** `billing_schedules` ✅ · `dunningNextAttemptAt` ✅ · `PAYMENT_REMINDER` template + `renderPaymentReminderHtml` ✅ · `resolveEnrolmentNotificationRecipient` ✅ · Resend pipeline ✅  
**Out of scope:** WhatsApp dunning · new email templates · **`pending_payment` / initial checkout dunning** (§6.x #8 — separate track) · admin blast · Stripe dashboard Smart Retries · enrolment cancel on suspend

---

## Architecture — what is (and is not) decoupled

### ✅ Decoupled from payment providers (V1 renewal track)

Dunning **state** lives on **`billing_schedules`** + **`engagements.billing_status`**, not on Stripe / Grow / iCount objects.

| Failure origin | Today | After this plan |
| --- | --- | --- |
| Stripe `payment_intent.payment_failed` webhook | `handle-payment-event.ts` inline update | → **`applyBillingScheduleDunningFailure`** |
| Grow / mock `emitSyncEvent` (`payment.failed`) | same webhook handler | → same |
| iCount IPN / mock IPN failure | same webhook handler | → same |
| `createCharge` / `chargeWithToken` throws before webhook | `renewal-billing.ts` catch (duplicate logic) | → same |
| Missing saved card token at cron time | Updates `last_error` only — **skips ladder** | → same helper (counts as attempt 1) |

The dunning module must **not** import `getPaymentProviderForTenant`, provider adapters, or branch on `payment_provider`. Inputs are **`billingScheduleId` + `failureMessage`** only.

### ❌ Not a unified dunning engine across payment types

| Payment context | Dunning today | This plan |
| --- | --- | --- |
| **Recurring renewal** (`billing_schedules`, `charge_type=renewal`) | Ladder + suspend ✅; emails ❌ | **In scope** |
| **Initial checkout fail** (`charge_type=initial`) | Provider / Stripe retries only; no app ladder | Out of scope |
| **`pending_payment` enrolment** (never paid) | Manual `send-admin-enrolment-link` | Out of scope (§6.x #8) |

Do **not** try to wire this plan into `create-checkout`, guest pay, or initial webhook failures. A future **engagement dunning** track would be a separate plan (`pending_payment` + cron), reusing the same **email** template but not `billing_schedules`.

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
| Missing saved token at cron | ❌ No ladder increment | **Fix:** route through dunning helper |

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
2. **Single entry point:** `applyBillingScheduleDunningFailure` — all schedule failure paths call this and **only** this for ladder + email. No inline schedule updates elsewhere.
3. **Provider-agnostic:** dunning modules must not import payment provider code or read `tenants.payment_provider`.
4. **Idempotent ladder:** if `attempt_count` is already ≥ input `previousAttemptCount + 1` for this failure generation, skip schedule update + email (guards webhook + catch double-fire).
5. Email send failures must **not** roll back schedule updates (log + continue).
6. **Do not** change dunning timing (`dunningNextAttemptAt`) or suspend threshold (3).
7. Run `pnpm -C apps/web test billing-time.test.ts provider-isolation-renewal-refund.test.ts renewal-dunning-email.test.ts`.
8. **No git commit/push** unless user explicitly asks.

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

## Step 1 — Email helper: `send-billing-schedule-dunning-reminder.ts`

**File:** `supabase/functions/_shared/payments/send-billing-schedule-dunning-reminder.ts`

**Export:**

```ts
export async function sendBillingScheduleDunningReminder(
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
   - Add `buildBillingScheduleDunningEmailCopy({ language, attemptCount, className, studentName, nextAttemptAt })` in `enrolment-payment-email.ts` (or colocated in helper file if cleaner).
   - EN attempt 1: *"We couldn't process your monthly payment for {class}. We'll retry on {date}."*
   - EN attempt 3: *"Your enrollment billing is suspended after 3 failed payment attempts. Please update your payment method in the portal."*
   - Mirror HE strings.
7. `paymentUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "") + "/dashboard/portal"` — if empty, still send with `#` and audit warning in `after_state`.
8. `sendRenderedEmail({ templateName: PAYMENT_REMINDER, ... })` matching `send-admin-enrolment-link` variables shape.
9. Audit success / catch failure.

---

## Step 2 — Single entry point: `apply-billing-schedule-dunning-failure.ts`

**File:** `supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts`

**Export:**

```ts
export async function applyBillingScheduleDunningFailure(
  service: SupabaseClient,
  input: {
    billingScheduleId: string;
    failureMessage: string;
  },
): Promise<{ attemptCount: number; nextAttemptAt: string | null; suspended: boolean; skipped?: boolean }>
```

**Behavior:**

1. Load schedule row: `id, tenant_id, engagement_id, attempt_count, status`.
2. If `status === 'suspended'` → return early (no-op).
3. Compute `nextAttempt = attempt_count + 1`. Apply existing ladder logic (`dunningNextAttemptAt`, suspend at 3, update `engagements.billing_status`).
4. Call `sendBillingScheduleDunningReminder` with loaded tenant/engagement ids.
5. **No provider imports.**

Move **all** inline schedule failure updates from `handle-payment-event.ts` and `renewal-billing.ts` into this function.

---

## Step 3 — Wire call sites (thin adapters only)

### 3a — `handle-payment-event.ts`

On `payment.failed` when `metadata.charge_type === 'renewal'` && `metadata.billing_schedule_id`:

```ts
await applyBillingScheduleDunningFailure(service, {
  billingScheduleId: metadata.billing_schedule_id,
  failureMessage: event.failureMessage ?? "Payment failed",
});
```

Remove inline `billing_schedules` update block entirely.

### 3b — `renewal-billing.ts`

**Catch block** — replace inline update with:

```ts
await applyBillingScheduleDunningFailure(service, {
  billingScheduleId: schedule.id,
  failureMessage: err instanceof Error ? err.message : "Charge failed",
});
```

**Missing saved token branch** (~L175–192) — replace `last_error`-only update with same call (`failureMessage: 'No saved card token'`).

Do **not** call dunning from provider adapters.

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
| Missing token at cron | Ladder attempt 1 + email |
| Double webhook + catch | Second call no-op (`skipped: true`) |

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

- [ ] `applyBillingScheduleDunningFailure` is the **only** schedule failure mutator
- [ ] All three entry paths use it (webhook, catch, missing token)
- [ ] Provider-agnostic (no imports from `providers/`)
- [ ] Idempotent per `(billing_schedule_id, attempt_count)`
- [ ] EN + HE copy for attempts 1–3
- [ ] Unit tests green
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated
- [ ] No migration

---

## File checklist

| Action | Path |
| --- | --- |
| Add | `supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts` |
| Add | `supabase/functions/_shared/payments/send-billing-schedule-dunning-reminder.ts` |
| Edit | `supabase/functions/_shared/enrolment-payment-email.ts` (renewal copy helpers) |
| Edit | `supabase/functions/_shared/payments/handle-payment-event.ts` |
| Edit | `supabase/functions/_shared/payments/renewal-billing.ts` |
| Add | `apps/web/src/__tests__/renewal-dunning-email.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Out of scope (explicit deferrals)

| Item | Track | Notes |
| --- | --- | --- |
| Automated `pending_payment` Day 3/7/14 | Engagement track | §6.x #8 — separate plan; reuse `PAYMENT_REMINDER` only |
| WhatsApp `payment_reminder` | — | Twilio deferred |
| `payment_reminder_urgent` separate template | — | Use `intro_overdue` / attempt-3 copy on same template |
| Cancel enrolment on suspend | — | SPEC V2; suspend + manual admin action |
| `notification_log` rows | — | Optional follow-up |

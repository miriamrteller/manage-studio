# Phase 1E — Payment dunning: collections layer + renewal track (paste into new agent chat)

**Status:** ✅ **Shipped** (2026-07-05, PR #11)

### Agent-readiness checklist

| Criterion | Status |
| --- | --- |
| V1 architecture locked (hybrid obligation + collections) | ✅ |
| One pre-V1 migration with exact SQL | ✅ |
| Single obligation mutator + single notifier | ✅ |
| Provider decoupling rules | ✅ |
| Idempotency SSOT (`notification_log.dunning_key`) | ✅ |
| Exact EN/HE copy strings (Step 1b) | ✅ |
| Email opt-out lookup pattern | ✅ |
| Schedule concurrency / double-fire guard | ✅ |
| Test matrix + run commands | ✅ |
| Enrolment unpaid cron | ✅ [enrolment-payment-dunning.md](enrolment-payment-dunning.md) — shipped same PR |

**Verdict:** Shipped. Renewal track + foundation schema. Enrolment cron shipped in same PR — see [enrolment-payment-dunning.md](enrolment-payment-dunning.md).

> **Post-squash (2026-07-05):** Dunning columns + `idx_notification_log_dunning_key` folded into `20260608001300_engagements.sql` and `20260608000600_communications.sql`. Original incremental archived at `migrations_backup/incremental_20260705/`.

## Mission

Implement the **V1 payment-dunning architecture** (obligation-on-domain-table + **shared collections code** + **`notification_log` idempotency**), then wire **renewal** failures (`billing_schedules`) to send **`PAYMENT_REMINDER`** emails.

This PR ships **renewal track only**. Enrolment unpaid dunning (§6.x #8) is a **follow-on plan** reusing the same collections module and migration columns added here.

**Repo:** `manage-studio`  
**SPEC:** Phase 1E dunning · [finance/stage-6-recurring-billing.md](finance/stage-6-recurring-billing.md)  
**Branch:** branch from `main`  
**Follow-on:** [enrolment-payment-dunning.md](enrolment-payment-dunning.md) (not this PR)  
**Depends on:** `billing_schedules` ✅ · `dunningNextAttemptAt` ✅ · `PAYMENT_REMINDER` ✅ · `notification_log` ✅ · Resend ✅  
**Out of scope:** WhatsApp · new templates · initial checkout fail dunning · waiver reminders (`send-waiver-reminder` stays separate) · generic `dunning_cases` table · provider-native smart retries (Meshulam/Grow dashboard retries — app owns email ladder only)

---

## V1 architecture decision (locked — do not diverge)

Industry-standard **hybrid** for studio SaaS at this scale:

```text
Layer 1 — Obligation (state on domain row, one SSOT per kind)
  ├─ Renewals:     billing_schedules (attempt_count, next_attempt_at, status)  ← already exists
  ├─ Unpaid enrol: engagements.payment_dunning_*                               ← add in Step 0 (unused until follow-on)
  └─ Waivers:      engagements.waiver_*_reminded_at                            ← existing; do not touch

Layer 2 — Payment execution (provider adapters, thin)
  └─ Normalized events → obligation updates only via apply* helpers

Layer 3 — Collections (shared code, provider-agnostic)
  └─ sendPaymentDunningReminder({ kind, dunningKey, ... })  ← one module for all payment dunning kinds

Layer 4 — Notification idempotency
  └─ notification_log.variables.dunning_key + partial unique index
```

**Do not** introduce a generic `dunning_cases` table or duplicate `billing_schedules.attempt_count` elsewhere.

| Kind | Obligation SSOT | Retry charge? | CTA |
| --- | --- | --- | --- |
| `renewal` | `billing_schedules` | Yes — `run-monthly-billing` | Portal `/dashboard/portal` |
| `enrolment_unpaid` | `engagements.payment_dunning_*` | No — remind + pay link | Signed enrolment URL (follow-on) |
| `waiver` | `engagements.waiver_*` | N/A | Separate cron |

---

**Payment provider context:** V1 production default is **Grow (Meshulam)** — IL bundled provisioning sets `payment_provider = 'grow'`. Stripe remains in the registry for legacy/split tenants but is **not** the dunning target. Collections + obligation layers must stay provider-agnostic (no `providers/` imports).

---

## External dependencies

| Service | Required? | Notes |
| --- | --- | --- |
| **Resend** + tenant `from_email` | Yes for live smoke | Same as admin enrolment link |
| **Twilio** | No | |
| New env vars | No | Uses `APP_URL` |

Unit tests run without Resend (mock `sendRenderedEmail`).

---

## Current state (shipped 2026-07-05, PR #11)

| Item | Status |
| --- | --- |
| Renewal ladder on `billing_schedules` | ✅ |
| Failure paths (webhook + cron catch + missing token) | ✅ via `applyBillingScheduleDunningFailure` |
| Shared collections module | ✅ |
| `notification_log` dunning idempotency | ✅ |
| `engagements.payment_dunning_*` columns | ✅ |
| Renewal `PAYMENT_REMINDER` emails | ✅ |

---

## Locked semantics — renewal track (this PR)

| Rule | Value |
| --- | --- |
| **Scope** | `charge_type === 'renewal'` + `billing_schedule_id` |
| **Obligation mutator** | `applyBillingScheduleDunningFailure` — **only** place that increments schedule `attempt_count` / suspend |
| **Notifier** | `sendPaymentDunningReminder` with `kind: 'renewal'` — **no** provider imports |
| **Recipient** | `resolveEnrolmentNotificationRecipient(tenantId, person_id)` |
| **Opt-out** | Skip **email only** — obligation update (schedule increment / suspend) already committed before send; do not roll back |
| **Template** | `EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER` |
| **CTA** | `${APP_URL}/dashboard/portal` |
| **Copy** | Attempt 1–2: retry date from `next_attempt_at`. Attempt 3 (suspended): suspend copy (EN + HE) |
| **Amount** | `resolveOfferingPrice(offering.price_minor)` |
| **Dunning key** | `renewal:<billing_schedule_id>:<attempt_count>` |
| **Idempotency SSOT** | `notification_log` — skip send if row exists with same `dunning_key` + `template_name = payment_reminder` |
| **Audit** | Insert `notification_log` on every send attempt; optional `audit_log` `billing_schedule.dunning_notified` for ops |
| **Admin email on suspend** | Out of scope |

---

## Hard rules

1. **One migration** (Step 0) — last schema change for payment dunning before V1 prod.
2. **Never** move renewal `attempt_count` off `billing_schedules`.
3. **Single schedule mutator:** `applyBillingScheduleDunningFailure` — remove all inline schedule failure updates elsewhere.
4. **Single notifier:** `sendPaymentDunningReminder` in `_shared/collections/` — renewal and future enrolment kinds share this file.
5. **Provider-agnostic:** collections + obligation helpers must not import `providers/` or read `payment_provider`.
6. **Idempotent:** check `dunning_key` before send; unique index prevents duplicate rows under concurrency.
7. Email failures must **not** roll back schedule updates.
8. **Do not** change `dunningNextAttemptAt` ladder or suspend threshold (3).
9. Run `pnpm -C packages/shared build` after schema/types change; run tests listed in Step 6.
10. **No git commit/push** unless user explicitly asks.

---

## Quality bar (industry · TDD · ops)

| Pillar | Requirement |
| --- | --- |
| **Industry** | Transactional payment emails; honour `email_opted_in`; separate from marketing (`notify_announcements` not checked). Renewal = charge retry + notify; enrolment = notify + pay link + terminal cancel (SPEC Day 3/7/14). |
| **TDD** | **Write tests before implementation** for pure functions: `buildDunningKey`, `hasDunningNotificationBeenSent` (mock Supabase), `buildRenewalDunningEmailCopy`, then obligation helper with mocked send. |
| **Reliability** | Optimistic concurrency; partial unique index; `23505` handling; obligation before email; email failure never rolls back obligation; missing-token path advances ladder (today only logs `last_error`). |
| **Scalability** | Cron batch limits (renewal 50 existing; enrolment 100); log WARNING when `BATCH_LIMIT` reached (mirror `send-waiver-reminder`). |
| **Maintainability** | Single mutator per track; shared collections; extend `resolveEnrolmentNotificationRecipient` → `{ email, name, personId }`. |
| **Robustness** | Missing recipient / opt-out / sender: skip send, obligation stands (renewal + enrolment). |
| **Security** | Cron: `CRON_SECRET` **required in prod** (`401` if set and header wrong; dev may omit). Service-role only in edge fns. Pay links: signed `WaiverToken` bound to recipient email. Do not log full provider error payloads in `audit_log` — truncate `failureMessage` to 500 chars. No card/PII in `notification_log.variables` beyond recipient email. Extend `resolveEnrolmentNotificationRecipient` → `{ email, name, personId }` for opt-out lookup (student vs account_holder person id). |

---

## Pre-flight (agent MUST read)

1. `supabase/migrations/20260608001600_finance.sql` — `billing_schedules`
2. `supabase/migrations/20260608001300_engagements.sql` — engagement shape
3. `supabase/migrations/20260608000600_communications.sql` — `notification_log`
4. `supabase/functions/_shared/payments/handle-payment-event.ts`
5. `supabase/functions/_shared/payments/renewal-billing.ts`
6. `supabase/functions/_shared/payments/billing-time.ts`
7. `supabase/functions/send-admin-enrolment-link/index.ts` — `PAYMENT_REMINDER` send pattern
8. `supabase/functions/send-notification/index.ts` — `notification_log` insert pattern
9. `packages/shared/src/schemas.ts` — `EngagementSchema` (update after migration)
10. `docs/plans/finance/stage-6-recurring-billing.md`

---

## Step 0 — Pre-V1 migration (foundation for both tracks)

**File (historical — pre-squash):** `supabase/migrations/20260705000100_payment_dunning_foundation.sql`  
**Authoritative (post-squash):** `20260608001300_engagements.sql` (columns) + `20260608000600_communications.sql` (dunning index)

```sql
-- Payment dunning foundation (V1 locked architecture).
-- Renewal SSOT remains billing_schedules; enrolment unpaid SSOT uses columns below (follow-on cron).

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS payment_dunning_attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_dunning_next_at TIMESTAMPTZ;

COMMENT ON COLUMN engagements.payment_dunning_attempt_count IS
  'Unpaid enrolment dunning ladder (§6.x #8). Zero until pending_payment cron runs. Not used for renewals.';
COMMENT ON COLUMN engagements.payment_dunning_next_at IS
  'Next enrolment payment reminder action time (Jerusalem policy in follow-on plan). NULL when inactive.';

-- Idempotency: one successful send per dunning_key (failed rows may retry).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dunning_key
  ON notification_log (tenant_id, template_name, (variables->>'dunning_key'))
  WHERE (variables->>'dunning_key') IS NOT NULL
    AND status IN ('sent', 'delivered', 'read', 'pending');
```

**Also update:**

- `packages/shared/src/schemas.ts` — add to `EngagementSchema` (after `cancelled_by`):

```ts
  payment_dunning_attempt_count: z.number().int().nonnegative().default(0).optional(),
  payment_dunning_next_at: TimestampSchema.nullable().optional(),
```

- `apps/web/src/__tests__/schemas.test.ts` — one parse test with the new fields
- Regenerate types after migration:

```bash
pnpm db:types:all:local
pnpm -C packages/shared build
```

(`db:types:all:local` requires local Supabase with migration applied; if unavailable, manually add columns to `packages/shared/src/database.types.ts` engagements Row/Insert/Update only — do not hand-edit edge `email-dist` copy; run `pnpm db:types:email-dist` after main types.)

**Do not** add triggers, RPCs, or a `dunning_cases` table.

---

## Step 1 — Shared collections module

### 1a — `dunning-idempotency.ts`

**File:** `supabase/functions/_shared/collections/dunning-idempotency.ts`

```ts
export function buildDunningKey(kind: 'renewal' | 'enrolment_unpaid', subjectId: string, attemptCount: number): string;

export async function hasDunningNotificationBeenSent(
  service: SupabaseClient,
  tenantId: string,
  dunningKey: string,
  templateName = 'payment_reminder',
): Promise<boolean>;
```

Query `notification_log` where `tenant_id`, `template_name = templateName`, `variables->>dunning_key = dunningKey`, `status IN ('sent','delivered','read','pending')`.

**Failed sends:** rows with `status = 'failed'` may include the same `dunning_key`; they do **not** count as sent (allows Resend retry). Only one **`sent`** row per key — enforced by partial unique index + pre-check.

```ts
export function buildDunningKey(
  kind: 'renewal' | 'enrolment_unpaid',
  subjectId: string,
  attemptCount: number,
): string {
  return `${kind}:${subjectId}:${attemptCount}`;
}
```

### 1b — `build-dunning-email-context.ts`

**File:** `supabase/functions/_shared/collections/build-dunning-email-context.ts`

```ts
export type DunningKind = 'renewal' | 'enrolment_unpaid';

export async function buildDunningEmailContext(
  service: SupabaseClient,
  input: {
    kind: DunningKind;
    tenantId: string;
    engagementId: string;
    offeringId: string;
    attemptCount: number;
    nextActionAt: string | null; // next_attempt_at or payment_dunning_next_at
    paymentUrl: string;
    language: 'en' | 'he';
  },
): Promise<{ recipientEmail: string; recipientName: string; recipientPersonId: string; variables: Record<string, unknown>; subject: string } | null>;
```

`recipientPersonId` = the `people.id` whose email is used (student if direct email; else account_holder). Extend `resolveEnrolmentNotificationRecipient` to return `{ email, name, personId }` **or** resolve `personId` inside `buildDunningEmailContext` with the same branching logic.
- **`renewal`:** use `buildRenewalDunningEmailCopy` below; `paymentUrl` from caller.
- **`enrolment_unpaid`:** `return null` in this PR — full implementation in [enrolment-payment-dunning.md](enrolment-payment-dunning.md) (agent-ready, blocked on this PR).

**Locked EN/HE copy — renewal (`buildRenewalDunningEmailCopy`):**

| Attempt | EN `intro` | HE `intro` |
| --- | --- | --- |
| 1 | We couldn't process your monthly payment for {className}. We'll try again on {dueDate}. | לא הצלחנו לחייב את התשלום החודשי עבור {className}. ננסה שוב ב-{dueDate}. |
| 2 | Your monthly payment for {className} is still outstanding. We'll retry on {dueDate}. | התשלום החודשי עבור {className} עדיין לא עבר. ננסה שוב ב-{dueDate}. |
| 3 | Your billing for {className} is suspended after 3 failed payment attempts. Please update your payment method in the portal. | החיוב עבור {className} הושעה לאחר 3 ניסיונות כושלים. עדכנו את אמצעי התשלום בפורטל. |

| Attempt | EN `ctaButton` | HE `ctaButton` |
| --- | --- | --- |
| 1–2 | Update payment method | עדכון אמצעי תשלום |
| 3 | Open parent portal | כניסה לפורטל |

- `dueDate` = `formatDate(nextActionAt, locale)` when `nextActionAt` set; attempt 3 use today's date formatted.
- `description` = `{studentName} — {className}` (same as admin link).
- `subject` (EN): attempt 3 → `Billing suspended — {className}`; else → `Payment failed — {className}`. HE: `החיוב הושעה — {className}` / `תשלום נכשל — {className}`.

Reuse `resolveEnrolmentNotificationRecipient`, load student `people.name`, `resolveOfferingPrice`, `formatCurrency` / `formatDate` from `enrolment-payment-email.ts` / `email-dist/format.js`.

### 1c — `send-payment-dunning-reminder.ts`

**File:** `supabase/functions/_shared/collections/send-payment-dunning-reminder.ts`

```ts
export async function sendPaymentDunningReminder(
  service: SupabaseClient,
  input: {
    kind: DunningKind;
    tenantId: string;
    engagementId: string;
    offeringId: string;
    subjectId: string;       // billing_schedule_id OR engagement_id (for key)
    attemptCount: number;
    nextActionAt: string | null;
    paymentUrl: string;
    recipientPersonId?: string; // for notification_log + opt-out lookup
  },
): Promise<{ sent: boolean; skipped?: string }>;
```

**Flow:**

1. `dunningKey = buildDunningKey(kind, subjectId, attemptCount)`
2. If `hasDunningNotificationBeenSent` → return `{ sent: false, skipped: 'already_sent' }`
3. Load tenant (`name`, `language_default`, `from_email`, `primary_color`, `accent_color`).
4. Resolve recipient via `buildDunningEmailContext` (includes `resolveEnrolmentNotificationRecipient`).
5. **Email opt-out** — after recipient resolved, load guardian/student `people.id` used for email; query:

```ts
const { data: prefs } = await service
  .from('contact_preferences')
  .select('email_opted_in')
  .eq('tenant_id', tenantId)
  .eq('person_id', recipientPersonId)
  .maybeSingle();
if (prefs?.email_opted_in === false) {
  return { sent: false, skipped: 'email_opted_out' };
}
```

(`recipientPersonId` = person row whose email was chosen — resolve from same path as `resolveEnrolmentNotificationRecipient`, not engagement.student only.)

6. `resolveNotificationFromEmail(tenant.from_email)` — on error return `{ sent: false, skipped: 'sender_not_configured' }`
7. `sendRenderedEmail` with `EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER` and variables:

| Variable | Source |
| --- | --- |
| `recipientName` | context |
| `enrolledClassName` / `className` | offering name |
| `amountOutstandingFormatted` | `resolveOfferingPrice` |
| `amountFormatted` | same |
| `dueDate` | context |
| `paymentUrl` | input |
| `description` | context |
| `intro`, `ctaButton` | context |

8. On success — insert **`notification_log`**:

```ts
await service.from('notification_log').insert({
  tenant_id: tenantId,
  recipient_person_id: recipientPersonId,
  recipient_email: recipientEmail,
  channel: 'email',
  template_name: 'payment_reminder',
  variables: { ...emailVariables, dunning_key: dunningKey, dunning_kind: kind },
  external_msg_id: result.id,
  status: 'sent',
  sent_at: new Date().toISOString(),
});
```

9. On Resend throw — insert `notification_log` with `status: 'failed'`, same `dunning_key` in variables, `failure_reason` message. Do **not** throw to caller (obligation update already committed). Multiple `failed` rows per key are allowed (index excludes them); a later successful `sent` row satisfies idempotency.

10. On `notification_log` insert **unique violation** (`23505` on `idx_notification_log_dunning_key`) — treat as `{ sent: false, skipped: 'already_sent' }` (concurrent cron/webhook).

**Renewal call shape (from obligation helper):**

```ts
await sendPaymentDunningReminder(service, {
  kind: 'renewal',
  tenantId,
  engagementId,
  offeringId,
  subjectId: billingScheduleId,
  attemptCount,
  nextActionAt: nextAttemptAt,
  paymentUrl: `${appBase}/dashboard/portal`,
});
```

---

## Step 2 — Renewal obligation helper

**File:** `supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts`

```ts
export async function applyBillingScheduleDunningFailure(
  service: SupabaseClient,
  input: { billingScheduleId: string; failureMessage: string },
): Promise<{ attemptCount: number; nextAttemptAt: string | null; suspended: boolean; skipped?: boolean }>;
```

**Behavior:**

1. Load schedule: `id, tenant_id, engagement_id, attempt_count, status`.
2. If `status === 'suspended'` → `{ skipped: true, attemptCount: attempt_count, nextAttemptAt: null, suspended: true }`.
3. Load engagement `person_id, offering_id`.
4. `expectedCount = attempt_count`; `nextAttempt = expectedCount + 1`.
5. Build `updates`: `attempt_count: nextAttempt`, `last_attempt_at: now()`, `last_error: failureMessage`.
6. If `nextAttempt >= 3`: `status: 'suspended'`, `next_attempt_at: null`; else `next_attempt_at: dunningNextAttemptAt(nextAttempt)`.
7. **Optimistic update** — prevents webhook + catch double increment:

```ts
const { data: updated, error } = await service
  .from('billing_schedules')
  .update(updates)
  .eq('id', billingScheduleId)
  .eq('attempt_count', expectedCount)
  .neq('status', 'suspended')
  .select('attempt_count, next_attempt_at, status')
  .maybeSingle();
if (!updated) {
  return { skipped: true, attemptCount: expectedCount, nextAttemptAt: null, suspended: false };
}
```

8. If suspending: `engagements.update({ billing_status: 'suspended' }).eq('id', engagement_id)`.
9. `appBase = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')`.
10. Call `sendPaymentDunningReminder` with `attemptCount: nextAttempt`, `nextActionAt: updated.next_attempt_at`, `paymentUrl: appBase ? `${appBase}/dashboard/portal` : '#'` (skip send if no `APP_URL` — obligation still advances).
11. Return `{ attemptCount: nextAttempt, nextAttemptAt: updated.next_attempt_at, suspended: nextAttempt >= 3 }`.

Move **all** inline schedule failure logic from `handle-payment-event.ts` and `renewal-billing.ts` here.

---

## Step 3 — Wire payment entry points (thin adapters)

### 3a — `handle-payment-event.ts`

On `payment.failed` when `metadata.charge_type === 'renewal'` && `metadata.billing_schedule_id`:

```ts
await applyBillingScheduleDunningFailure(service, {
  billingScheduleId: metadata.billing_schedule_id,
  failureMessage: event.failureMessage ?? 'Payment failed',
});
```

Remove inline `billing_schedules` update block.

### 3b — `renewal-billing.ts`

- **Catch block** → same `applyBillingScheduleDunningFailure` call.
- **Missing saved token branch** (~L175–192) → same call with `failureMessage: 'No saved card token'`.

**Do not** call dunning from provider adapters.

**Known provider edge (V1 accept):** Some adapters (notably **Grow** `createTransactionWithToken` + IPN/webhook) may surface the same renewal failure via **both** a synchronous throw (cron catch) and a later webhook. Optimistic `attempt_count` guard prevents duplicate increments **within the same count**, but two paths in sequence can advance twice for one charge attempt. Document in code comment — do not add provider refs to dunning SSOT in V1.

---

## Step 4 — Refactor admin link (optional, recommended)

`send-admin-enrolment-link` already sends `PAYMENT_REMINDER` for manual unpaid enrolment. **Do not refactor in this PR** unless trivial — note for follow-on: manual admin send does **not** use `dunning_key` (different idempotency: admin action). Enrolment cron will use `enrolment_unpaid:<engagement_id>:<attempt>`.

---

## Step 5 — Tests (TDD order)

**Write in this order:**

1. `payment-dunning-collections.test.ts` — `buildDunningKey`, `hasDunningNotificationBeenSent` (pure / mocked DB)
2. Renewal copy helpers (if extracted) — EN/HE attempt 1–3 strings
3. `applyBillingScheduleDunningFailure` integration tests (mock Supabase + mock `sendPaymentDunningReminder`)

**File:** `apps/web/src/__tests__/payment-dunning-collections.test.ts`

| Case | Assert |
| --- | --- |
| `buildDunningKey('renewal', id, 2)` | Stable string format |
| Idempotency helper | Second check returns true after log insert |
| `applyBillingScheduleDunningFailure` attempt 1 | schedule updated + `sendPaymentDunningReminder` mocked once |
| Attempt 3 | suspended + suspend copy |
| Double webhook + catch | schedule not double-incremented; one notification_log row |
| Missing recipient | no throw; notification_log failed or skip |
| `email_opted_in=false` | skip send; schedule still incremented; no `sent` notification_log row |
| Unique violation `23505` on insert | treated as `already_sent` |
| `failureMessage` truncation in audit | max 500 chars if optional audit added |

Mock `sendRenderedEmail` and Supabase client per `provider-isolation-renewal-refund.test.ts`.

**Also run:**

```bash
pnpm -C apps/web test billing-time.test.ts provider-isolation-renewal-refund.test.ts payment-dunning-collections.test.ts
```

---

## Step 6 — Docs + verification commands

Update `docs/IMPLEMENTATION_STATUS.md` (see Definition of done).

**Post-impl command block:**

```bash
pnpm db:types:all:local
pnpm -C packages/shared build
pnpm -C apps/web test payment-dunning-collections.test.ts billing-time.test.ts provider-isolation-renewal-refund.test.ts
```

---

## Manual smoke (post-impl)

1. Apply migration locally.
2. Recurring tenant + mock token + due `billing_schedules` row.
3. Force renewal failure (mock decline or `payment.failed` webhook).
4. Verify one Resend delivery + one `notification_log` row with `variables.dunning_key`.
5. Replay same failure → no second email (idempotency).
6. Third failure → suspend + final email tone.

---

## Definition of done

- [ ] Step 0 migration applied; `EngagementSchema` updated
- [ ] `_shared/collections/` module (idempotency, context, send)
- [ ] `applyBillingScheduleDunningFailure` is sole renewal schedule mutator
- [ ] All three renewal entry paths wired (webhook, catch, missing token)
- [ ] Idempotency via `notification_log.dunning_key` + unique index
- [ ] EN + HE renewal copy for attempts 1–3
- [ ] Tests green
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated
- [ ] No generic dunning table; no waiver changes

---

## File checklist

| Action | Path |
| --- | --- |
| Add | `supabase/migrations/20260705000100_payment_dunning_foundation.sql` |
| Add | `supabase/functions/_shared/collections/dunning-idempotency.ts` |
| Add | `supabase/functions/_shared/collections/build-dunning-email-context.ts` |
| Add | `supabase/functions/_shared/collections/send-payment-dunning-reminder.ts` |
| Add | `supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts` |
| Edit | `supabase/functions/_shared/enrolment-recipient.ts` — add `personId` to return type |
| Edit | `supabase/functions/_shared/payments/handle-payment-event.ts` |
| Edit | `supabase/functions/_shared/payments/renewal-billing.ts` |
| Edit | `packages/shared/src/schemas.ts` |
| Edit | `apps/web/src/__tests__/schemas.test.ts` |
| Add | `apps/web/src/__tests__/payment-dunning-collections.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Out of scope (this PR)

| Item | Where |
| --- | --- |
| `run-enrolment-payment-dunning` cron | [enrolment-payment-dunning.md](enrolment-payment-dunning.md) |
| WhatsApp reminders | Deferred |
| Waiver cron merge | Never — separate domain |
| Refactor `send-admin-enrolment-link` | Optional later |
| Cancel enrolment on billing suspend | V2 — engagement stays `active` with `billing_status=suspended` |

---

## Audit notes (2026-07-05)

| Severity | Issue | Resolution |
| --- | --- | --- |
| **Critical** | Unique index on all `dunning_key` rows blocked Resend retries after `failed` | Index now partial on successful statuses only |
| **Medium** | `recipientPersonId` for opt-out not returned by `resolveEnrolmentNotificationRecipient` | Plan requires `personId` in context builder |
| **Medium** | Concurrent duplicate sends | Handle `23505` on insert |
| **Low** | Opt-out semantics undocumented for renewal | Locked: obligation advances, email skipped |
| **Low** | Catch + webhook double-advance | Documented V1 accept |
| **Out of scope** | Portal CTA requires login (renewals only) | OK — payers already enrolled |
| **Low** | `hasDunningNotificationBeenSent` must accept `templateName` param | Fixed — for cancellation reuse in enrolment plan |

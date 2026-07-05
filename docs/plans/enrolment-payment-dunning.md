# Phase 1E / §6.x #8 — Enrolment unpaid payment dunning (paste into new agent chat)

**Status:** **Ready** for automated implementation (2026-07-05, hardened)

### Agent-readiness checklist

| Criterion | Status |
| --- | --- |
| Depends on renewal collections PR | ⚠️ **Blocked until** [payment-dunning-notifications.md](payment-dunning-notifications.md) merges |
| V1 architecture (engagement obligation + shared collections) | ✅ |
| Uses foundation migration only (no new SQL) | ✅ |
| Locked Day 3 / 7 / 14 policy (SPEC-aligned) | ✅ |
| Exact EN/HE copy (attempts 1–2 + cancellation) | ✅ |
| Pay URL helper extracted (shared with admin link) | ✅ |
| Cron edge function + auth pattern | ✅ |
| Clear dunning on payment success | ✅ |
| Test matrix + run commands | ✅ |
| Waiting list automation | ❌ V2.2 TODO (audit only) |

**Verdict:** Ready to paste into a new agent chat **after** the renewal/collections PR lands. Same industry-standard hybrid as renewal plan — **not** a separate dunning engine.

---

## Mission

Automated **Day 3 / 7 / 14** follow-up for engagements in **`pending_payment`**: send escalating **`PAYMENT_REMINDER`** emails (days 3 and 7), then **cancel** the engagement on day 14 and send **`class_cancellation`**. Reuse **`_shared/collections/`** from the renewal PR.

**Repo:** `manage-studio`  
**SPEC:** Phase 1E dunning · §6.x #8 · SPEC Day 3/7/14 prose  
**Branch:** branch from `main` (after renewal dunning PR)  
**Depends on:** [payment-dunning-notifications.md](payment-dunning-notifications.md) ✅ · migration `20260705000100_payment_dunning_foundation.sql` ✅  
**Out of scope:** Renewal billing · waiver cron · admin manual link behaviour change · waiting list offer (V2.2) · WhatsApp · new templates

---

## V1 architecture (locked — inherit from renewal plan)

| Layer | Enrolment unpaid |
| --- | --- |
| **Obligation SSOT** | `engagements.payment_dunning_attempt_count`, `payment_dunning_next_at` |
| **Lifecycle SSOT** | `engagements.status` (`pending_payment` until paid or cancelled) |
| **Anchor time** | `engagements.created_at` (absolute Day 3 / 7 / 14, Jerusalem calendar) |
| **Collections** | `sendPaymentDunningReminder({ kind: 'enrolment_unpaid' })` for attempts 1–2 |
| **Terminal** | Day 14: service-role cancel + `CLASS_CANCELLATION` email |
| **Idempotency** | `dunning_key = enrolment_unpaid:<engagement_id>:<attempt_count>` on reminders; `:3` on cancellation log |
| **Retry charge?** | **No** — parent pays via signed link only |

Do **not** use `billing_schedules`. Do **not** add a `dunning_cases` table.

---

## Locked policy (V1)

| Step | Calendar day from `created_at` | `attempt_count` after step | Email | Engagement |
| --- | --- | --- | --- | --- |
| 1 | **Day 3** | 1 | `payment_reminder` (standard copy) | stays `pending_payment` |
| 2 | **Day 7** | 2 | `payment_reminder` (urgent copy) | stays `pending_payment` |
| 3 | **Day 14** | 3 | `class_cancellation` | **`cancelled`** |

- **Timezone:** `Asia/Jerusalem` — same helpers as billing (`billing-time.ts` patterns).
- **Admin manual link** (`send-admin-enrolment-link`): unchanged; does **not** increment `payment_dunning_attempt_count`. Cron continues independently.
- **Payment success:** clear dunning fields in `finalise-payment` (Step 5).
- **Waiting list:** insert `audit_log` with `-- TODO: process-waiting-list V2.2` comment only (match `cancel_engagement` RPC).

**Day 14 cancellation (locked):** service-role `engagements` update (mirror `send-waiver-reminder` cancel path — **do not** call `cancel_engagement` RPC; it requires `auth.uid()` admin).

```ts
await service.from('engagements').update({
  status: 'cancelled',
  cancelled_at: new Date().toISOString(),
  cancellation_reason: 'payment_dunning_exhausted',
  payment_dunning_next_at: null,
}).eq('id', engagementId).eq('status', 'pending_payment');
```

---

## External dependencies

| Service | Required? |
| --- | --- |
| Resend + tenant `from_email` | Yes for live smoke |
| `APP_URL` | Yes (pay links) |
| `CRON_SECRET` | Yes in prod (same as `run-monthly-billing`) |
| New SQL migration | **No** — columns from renewal Step 0 |

---

## Current state (after renewal PR)

| Item | Expected |
| --- | --- |
| `engagements.payment_dunning_*` columns | ✅ from `20260705000100` |
| `idx_notification_log_dunning_key` | ✅ |
| `_shared/collections/send-payment-dunning-reminder.ts` | ✅ |
| `buildDunningEmailContext` `enrolment_unpaid` | ❌ stub → implement |
| `run-enrolment-payment-dunning` | ❌ |
| Bootstrap `payment_dunning_next_at` | ❌ |

---

## Hard rules

1. **No new migration** — use foundation from renewal PR only.
2. **Single obligation mutator:** `applyEnrolmentPaymentDunningStep(engagementId)` — only place that increments `payment_dunning_attempt_count` / cancels for dunning.
3. **Reuse collections** for attempts 1–2; cancellation email via `sendRenderedEmail` + `EMAIL_TEMPLATE_NAMES.CLASS_CANCELLATION`.
4. **Optimistic concurrency:** update with `.eq('payment_dunning_attempt_count', expectedCount).eq('status', 'pending_payment')`.
5. Cron must **skip** engagements that left `pending_payment` (paid, admin cancel, etc.).
6. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. [payment-dunning-notifications.md](payment-dunning-notifications.md) — collections module (merged)
2. `supabase/functions/_shared/collections/send-payment-dunning-reminder.ts`
3. `supabase/functions/_shared/collections/build-dunning-email-context.ts`
4. `supabase/functions/send-waiver-reminder/index.ts` — cron batch + service-role cancel
5. `supabase/functions/send-admin-enrolment-link/index.ts` — pay URL + token signing
6. `supabase/functions/run-monthly-billing/index.ts` — `CRON_SECRET` auth
7. `supabase/functions/_shared/payments/finalise-payment.ts` — `activateInitialEngagement`
8. `supabase/functions/_shared/payments/billing-time.ts` — Jerusalem date helpers
9. `packages/shared/src/i18n/email-templates-en.json` — `class_cancellation`, `payment_reminder`

---

## Step 1 — Time helpers: `enrolment-dunning-time.ts`

**File:** `supabase/functions/_shared/collections/enrolment-dunning-time.ts`

```ts
/** Absolute day offsets from engagement.created_at (Jerusalem calendar). */
export const ENROLMENT_DUNNING_DAY_OFFSETS = [3, 7, 14] as const;

/** ISO timestamp when attempt N (1|2|3) is due. */
export function enrolmentDunningActionDueAt(
  createdAtIso: string,
  attemptNumber: 1 | 2 | 3,
): string;

/** Next scheduled action after completing attempt N; null after attempt 3. */
export function enrolmentDunningNextActionAt(
  createdAtIso: string,
  completedAttempt: number,
): string | null;
```

Implement using Jerusalem calendar (add days to `created_at` date in `Asia/Jerusalem`, return start-of-day or same time-of-day as `dunningNextAttemptAt` — **use end of Jerusalem day 23:59:59.999** for due comparisons, or **start of due day 00:00** consistently; pick **start of due day 00:00 Jerusalem** and document in code comment).

**Tests:** `apps/web/src/__tests__/enrolment-dunning-time.test.ts`

| `created_at` (Jerusalem) | Attempt | Due |
| --- | --- | --- |
| 2026-06-01 | 1 | 2026-06-04 00:00 IL |
| 2026-06-01 | 2 | 2026-06-08 00:00 IL |
| 2026-06-01 | 3 | 2026-06-15 00:00 IL |

---

## Step 2 — Shared pay URL helper

**File:** `supabase/functions/_shared/enrolment-pay-url.ts`

```ts
export async function buildEnrolmentPayUrl(input: {
  appBaseUrl: string;
  engagementId: string;
  tenantId: string;
  recipientEmail: string;
  linkTtlSeconds?: number; // default 7 * 24 * 3600
}): Promise<{ paymentUrl: string; linkExpiresAt: Date }>;
```

Logic (extract from `send-admin-enrolment-link`):

1. `expireAt = floor(now/1000) + ttl`
2. `signWaiverToken({ eid, tid, em: recipientEmail, exp: expireAt })`
3. `paymentUrl = `${appBaseUrl}/enrol/pay/${encodeURIComponent(engagementId)}?t=${wt}``

**Refactor** `send-admin-enrolment-link/index.ts` to call `buildEnrolmentPayUrl` — **required** (DRY; cron uses same helper).

---

## Step 3 — Extend `build-dunning-email-context.ts`

Implement **`enrolment_unpaid`** branch (replace stub).

**Locked EN/HE copy — attempts 1–2:**

| Attempt | EN `intro` | HE `intro` |
| --- | --- | --- |
| 1 | Payment for {className} is still outstanding. Please complete enrollment using the link below. | התשלום עבור {className} עדיין לא הושלם. נא להשלים את ההרשמה בקישור למטה. |
| 2 | Reminder: enrollment for {className} is still unpaid. Please complete payment soon to secure the spot. | תזכורת: ההרשמה ל{className} עדיין לא שולמה. נא להשלים את התשלום בהקדם. |

| Attempt | EN `ctaButton` | HE `ctaButton` |
| --- | --- | --- |
| 1–2 | Complete enrollment | השלמת הרשמה ותשלום |

- Reuse `buildAdminCompletionLinkEmailCopy` tone where helpful, or inline above strings.
- `dueDate` = `formatDate(linkExpiresAt)` (7-day link TTL, same as admin link).
- `subject` EN: attempt 2 → `Reminder: complete enrollment — {className}`; else → `Complete enrollment — {className}`. HE equivalents.

**Attempt 3:** not handled here — cancellation uses `CLASS_CANCELLATION` in Step 4.

---

## Step 4 — Obligation helper: `apply-enrolment-payment-dunning-step.ts`

**File:** `supabase/functions/_shared/collections/apply-enrolment-payment-dunning-step.ts`

```ts
export async function applyEnrolmentPaymentDunningStep(
  service: SupabaseClient,
  engagementId: string,
  appBaseUrl: string,
): Promise<
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'reminded'; attemptCount: 1 | 2 }
  | { outcome: 'cancelled'; attemptCount: 3 }
  | { outcome: 'error'; message: string }
>;
```

**Behavior:**

1. Load engagement: `id, tenant_id, person_id, offering_id, status, created_at, payment_dunning_attempt_count, payment_dunning_next_at`.
2. If `status !== 'pending_payment'` → skip `{ reason: 'not_pending_payment' }`.
3. If `payment_dunning_attempt_count >= 3` → skip.
4. **Bootstrap** — if `payment_dunning_next_at === null` && count === 0: set `payment_dunning_next_at = enrolmentDunningActionDueAt(created_at, 1)` (update only; if still in future, return skip `{ reason: 'not_due' }`).
5. If `now < payment_dunning_next_at` → skip `{ reason: 'not_due' }`.
6. `nextAttempt = payment_dunning_attempt_count + 1` (1, 2, or 3).
7. **Optimistic update:**

```ts
const nextAt =
  nextAttempt < 3
    ? enrolmentDunningNextActionAt(created_at, nextAttempt)
    : null;

const { data: updated } = await service
  .from('engagements')
  .update({
    payment_dunning_attempt_count: nextAttempt,
    payment_dunning_next_at: nextAt,
  })
  .eq('id', engagementId)
  .eq('status', 'pending_payment')
  .eq('payment_dunning_attempt_count', payment_dunning_attempt_count)
  .select('id, tenant_id, person_id, offering_id')
  .maybeSingle();

if (!updated) return { outcome: 'skipped', reason: 'concurrent_update' };
```

8. **Attempts 1–2:**
   - Resolve recipient via `resolveEnrolmentNotificationRecipient`.
   - `buildEnrolmentPayUrl({ appBaseUrl, engagementId, tenantId, recipientEmail })`.
   - `sendPaymentDunningReminder({ kind: 'enrolment_unpaid', subjectId: engagementId, paymentUrl, ... })`.
   - Return `{ outcome: 'reminded', attemptCount: nextAttempt }`.

9. **Attempt 3:**
   - Cancel engagement (locked SQL above) with `.eq('status', 'pending_payment')`.
   - Send cancellation email:

```ts
await sendRenderedEmail({
  to: recipientEmail,
  from: fromEmail,
  renderInput: {
    templateName: EMAIL_TEMPLATE_NAMES.CLASS_CANCELLATION,
    language,
    schoolName,
    tenantColors: { ... },
    variables: {
      recipientName,
      cancelledClassName: className,
      cancelledDate: formatDate(new Date().toISOString(), locale),
      cancellationReason: language === 'he'
        ? 'התשלום לא הושלם בתוך 14 ימים'
        : 'Payment was not completed within 14 days',
    },
  },
});
```

   - Insert `notification_log` with `template_name: 'class_cancellation'`, `variables.dunning_key: enrolment_unpaid:${engagementId}:3`, `variables.dunning_kind: 'enrolment_unpaid'`.
   - `audit_log` `engagement.dunning_cancelled` with `{ attempt_count: 3 }` + TODO waiting list comment.
   - Return `{ outcome: 'cancelled', attemptCount: 3 }`.

---

## Step 5 — Clear dunning on payment success

**File:** `supabase/functions/_shared/payments/finalise-payment.ts`

In `activateInitialEngagement` update block, add:

```ts
payment_dunning_attempt_count: 0,
payment_dunning_next_at: null,
```

(Ensures paid engagements never re-enter cron queue.)

---

## Step 6 — Cron edge function

**File:** `supabase/functions/run-enrolment-payment-dunning/index.ts`

Mirror `run-monthly-billing` auth + batch pattern:

| Constant | Value |
| --- | --- |
| `BATCH_LIMIT` | 100 |
| Auth | `CRON_SECRET` via `Authorization: Bearer` or `x-cron-secret` |
| Method | POST |

**Query:**

```ts
const { data: rows } = await service
  .from('engagements')
  .select('id')
  .eq('status', 'pending_payment')
  .lt('payment_dunning_attempt_count', 3)
  .or(
    `payment_dunning_next_at.lte.${nowIso},and(payment_dunning_next_at.is.null,payment_dunning_attempt_count.eq.0)`,
  )
  .limit(BATCH_LIMIT);
```

Loop: `applyEnrolmentPaymentDunningStep(service, row.id, appBaseUrl)`.

`appBaseUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')` — if empty, log warning and skip remind steps that need URL (still allow day-14 cancel with email sans rebook link).

**Register in** `supabase/config.toml`:

```toml
[functions.run-enrolment-payment-dunning]
verify_jwt = false
entrypoint = "./functions/run-enrolment-payment-dunning/index.ts"
```

**Cron schedule (comment in function header + §7 runbook note):** daily **03:00 Asia/Jerusalem** (document UTC equivalent). Same invocation pattern as `run-monthly-billing` — pg_cron `net.http_post` with `x-cron-secret`. **Do not** add pg_cron SQL in this PR unless repo already documents pattern in a migration comment — add header comment only.

---

## Step 7 — Tests

**File:** `apps/web/src/__tests__/enrolment-payment-dunning.test.ts`

| Case | Assert |
| --- | --- |
| Day 3 due | attempt → 1, reminder sent, next_at = day 7 |
| Day 7 due | attempt → 2, urgent copy |
| Day 14 due | status `cancelled`, `CLASS_CANCELLATION` sent |
| Not due yet | skip, count unchanged |
| Already paid / `active` | skip |
| Concurrent double cron | one increment only |
| Idempotency | same attempt no duplicate `notification_log` sent row |
| `email_opted_in=false` | skip reminder; attempt still increments **or** skip increment? **Locked: skip send but still increment** — obligation advances; parent can pay via portal/admin. Document in code. |

**Locked semantics for opt-out on reminders:** increment obligation + schedule next step; **skip email only** (studio still releases slot on day 14).

**Run:**

```bash
pnpm -C apps/web test enrolment-dunning-time.test.ts enrolment-payment-dunning.test.ts payment-dunning-collections.test.ts
```

---

## Step 8 — Docs

Update `docs/IMPLEMENTATION_STATUS.md`:

- §6.x #8 automated enrolment dunning → ✅
- Remove from deferred backlog list (item 8) or mark shipped
- Suggested next work: remove **1b** row or mark complete

Update `SPEC.md` §6.x item 8 footnote → shipped link (optional one-line if agent touches SPEC).

---

## Manual smoke

1. Create `pending_payment` engagement (guest or admin intake).
2. Backdate `created_at` or `payment_dunning_next_at` in dev DB to trigger step 1.
3. POST `run-enrolment-payment-dunning` with `CRON_SECRET`.
4. Verify Resend reminder + `notification_log.dunning_key`.
5. Advance to day 14 → engagement `cancelled` + cancellation email.

---

## Definition of done

- [ ] `enrolment-dunning-time.ts` + tests
- [ ] `buildEnrolmentPayUrl` + admin link refactor
- [ ] `buildDunningEmailContext` enrolment_unpaid implemented
- [ ] `applyEnrolmentPaymentDunningStep` + cron function
- [ ] `finalise-payment` clears dunning fields
- [ ] `config.toml` entry
- [ ] Tests green
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated
- [ ] No new migration

---

## File checklist

| Action | Path |
| --- | --- |
| Add | `supabase/functions/_shared/collections/enrolment-dunning-time.ts` |
| Add | `supabase/functions/_shared/enrolment-pay-url.ts` |
| Add | `supabase/functions/_shared/collections/apply-enrolment-payment-dunning-step.ts` |
| Edit | `supabase/functions/_shared/collections/build-dunning-email-context.ts` |
| Edit | `supabase/functions/send-admin-enrolment-link/index.ts` |
| Edit | `supabase/functions/_shared/payments/finalise-payment.ts` |
| Add | `supabase/functions/run-enrolment-payment-dunning/index.ts` |
| Edit | `supabase/config.toml` |
| Add | `apps/web/src/__tests__/enrolment-dunning-time.test.ts` |
| Add | `apps/web/src/__tests__/enrolment-payment-dunning.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Out of scope

| Item | Notes |
| --- | --- |
| Waiting list offer on cancel | V2.2 — TODO in audit only |
| WhatsApp Day 3/7/14 | Twilio deferred |
| Admin link → collections refactor | Manual path keeps separate audit |
| `cancel_engagement` RPC for cron | Requires admin JWT — use service update |

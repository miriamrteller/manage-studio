# Stage 6 — Recurring Billing (Scheduler + Dunning)

> **Implementation plan (V1):** [payment-dunning-notifications.md](../payment-dunning-notifications.md) — obligation on `billing_schedules`, shared `_shared/collections/` notifier, `notification_log.dunning_key` idempotency. Enrolment unpaid track: [enrolment-payment-dunning.md](../enrolment-payment-dunning.md).

> **Depends on:** Stage 3 (`finalise-payment`, `saveCard`, renewal metadata), Stage 4, Stage 2.
> **Outcome:** Flows B and C — schedules, monthly billing, dunning.

## Locked V1 policy

See overview defaults table:

- Billing day: **1st** of calendar month (Jerusalem).
- No proration.
- **Dunning ladder (calendar days from billing due date):**
  - **Day 1** — first charge attempt (`next_attempt_at` NULL, `next_billing_date` due).
  - **Day 4** — second attempt (+3 days after first failure → set `next_attempt_at`).
  - **Day 8** — third attempt (+4 days after second failure → set `next_attempt_at`).
- After 3 failed attempts: `billing_status='suspended'`, schedule `suspended`, dunning emails.
- 7-day grace window: student may attend Day 1 through Day 8 while retries run.

> **`next_billing_date`** = monthly billing period anchor (only advances on **successful** payment).
> **`next_attempt_at`** = dunning retry time only; never used for the happy-path monthly bill date.

## Date / timezone rule

All billing due comparisons use **`Asia/Jerusalem`** calendar date/time (`.instructions.md`).
Implement `todayInJerusalem(): Date` / `nowInJerusalem(): DateTime` in shared billing helper.

## Flow B — recurring initial (in `finalise-payment`)

When `chargeType === 'initial'` && `billing_mode === 'recurring'`:
1. After successful initial charge (Flow A), `saveCard` → default `payment_method_tokens` row.
2. Set `engagements.provider_customer_ref` if returned.
3. INSERT `billing_schedules`:
   - `next_billing_date` = 1st of **next** calendar month (Jerusalem)
   - `next_attempt_at` = NULL
   - `billing_account_id`, `payment_method_token_id` from engagement/account

**Card save timing:** after PaymentIntent succeeds, attach PaymentMethod / store token — not before
first charge.

## Flow C — `run-monthly-billing`

Service-role, `CRON_SECRET`. Modes: `batch` (cron) | `single` (tests).

**Select due schedules** (`status='active'`, limit 50):
```sql
WHERE status = 'active'
  AND (
    (next_attempt_at IS NOT NULL AND next_attempt_at <= now())
    OR
    (next_attempt_at IS NULL AND next_billing_date <= <today_jerusalem>)
  )
```

Per schedule:
1. Load engagement, offering, token, tenant.
2. `resolveOfferingPrice()` for amount (catalogue SSOT).
3. `getPaymentProvider(tenant).createCharge({
     savedToken,
     idempotencyKey: 'renewal-<engagement_id>-<YYYY-MM>',
     metadata: {
       tenant_id,
       engagement_id,
       billing_account_id,
       billing_schedule_id: schedule.id,
       charge_type: 'renewal',
     },
   })`.

### Success path

**Stripe (production path):** off-session charge completes asynchronously →
`payment_intent.succeeded` webhook → `handle-payment-event` → INSERT renewal payment →
**`finalisePayment({ chargeType: 'renewal', billingScheduleId })`** → document enqueued →
`advanceBillingSchedule` inside finalise (see Stage 3).

**Mock (CI path):** `MockPaymentProvider.createCharge` **synchronously** invokes the same webhook
handler with `payment.succeeded` + full metadata — no separate HTTP call. Tests assert payment row,
document queue row, and schedule advance in one flow.

### Failure path

Handled in **`handle-payment-event`** on `payment.failed` when `metadata.charge_type === 'renewal'`
(or inline for mock immediate failures):

- `attempt_count += 1`, `last_attempt_at = now()`, `last_error` set.
- Set `next_attempt_at` per ladder (do **not** move `next_billing_date`):
  - after attempt 1 failure → `now() + interval '3 days'` (retry Day 4)
  - after attempt 2 failure → `now() + interval '4 days'` (retry Day 8)
- `attempt_count >= 3` → `engagements.billing_status = 'suspended'`, schedule `status = 'suspended'`,
  dunning emails to admin + payer.

Cron failure path for charge API errors (before webhook): same dunning update inline in
`run-monthly-billing` when `createCharge` throws.

### pg_cron

Monthly (1st 01:00 Jerusalem — document UTC offset in runbook) + **daily 02:00** retry sweep
(both call `run-monthly-billing` batch mode).

## Rate limiting

Batch cap 50; invoicing async via queue; charge calls sequential per batch.

## Admin controls

Pause/resume schedule (`paused` ↔ `active`). Dashboard card → Stage 9.

## Definition of Done

- [ ] Recurring enrol → token + schedule with correct `next_billing_date`.
- [ ] Mock renewal (sync path) → renewal payment + metadata + document + schedule advanced.
- [ ] Stripe renewal (webhook path) → same outcome with PaymentIntent metadata.
- [ ] Failures use `next_attempt_at` only; `next_billing_date` unchanged until success.
- [ ] Third failure suspends + emails; ladder matches Day 1 / 4 / 8.
- [ ] Same-month idempotency key prevents double charge.
- [ ] `finalisePayment('renewal')` does not re-activate engagement.
- [ ] Pause/resume; catalogue price changes reflected.
- [ ] Committed; `main` green.

## Test cases

1. Schedule created on recurring enrol.
2. Mock monthly renewal (sync webhook path) with full metadata.
3. Failure increments attempt_count; next_attempt_at +3 then +4 days; billing date unchanged.
4. Third failure suspends.
5. Same-month re-run no double charge.
6. Paused skipped.
7. Price change on renewal.
8. Webhook renewal without `billing_schedule_id` in metadata → rejected / no schedule advance.

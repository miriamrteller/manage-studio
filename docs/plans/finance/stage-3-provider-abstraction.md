# Stage 3 — Payment Provider Abstraction

> **Depends on:** Stage 1 (renamed columns/RPCs). Stage 2 should land first if webhook enqueues
> documents; otherwise guard `enqueueDocument` until Stage 2 merges.
> **Outcome:** `PaymentProvider` + `finalise-payment` shared block; payment Edge Functions
> provider-agnostic.

## Objective

Decouple money-movement from Stripe. Introduce **`finalise-payment`** here so Stage 4/5/6 do not
duplicate activation + document enqueue logic.

## Files to create

### `_shared/payments/` layout

```
payments/
  types.ts
  registry.ts                 -- PAYMENT_PROVIDER_SLUGS + Zod
  index.ts                    -- getPaymentProvider(tenant)
  finalise-payment.ts         -- shared success side-effects
  advance-billing-schedule.ts -- renewal schedule advance (called from finalise)
  providers/
    mock.ts
    stripe.ts
```

### `PaymentProvider` interface (`types.ts`)

```ts
/** Attached to every PaymentIntent / charge — webhook reads this to route finalisation. */
export interface ChargeMetadata {
  tenant_id: string;
  engagement_id: string;
  billing_account_id: string;
  charge_type: 'initial' | 'renewal';
  /** Required when charge_type === 'renewal' */
  billing_schedule_id?: string;
}

export interface ChargeParams {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  metadata: ChargeMetadata;
  savedToken?: string;
  customerRef?: string;
  // ... client-facing fields for embedded checkout (initial charges)
}

export interface ChargeResult {
  clientSecret?: string;
  providerPaymentRef: string;
  customerRef?: string;
}

export interface PaymentEvent {
  type: 'payment.succeeded' | 'payment.failed';
  providerPaymentRef: string;
  metadata: ChargeMetadata;
  // ... amounts, failure reason
}

export interface PaymentProvider {
  readonly slug: string;
  createCharge(params: ChargeParams): Promise<ChargeResult>;
  constructEvent(rawBody: string, headers: Headers): Promise<PaymentEvent>;
  saveCard?(params: { customerRef: string; paymentMethodId: string }): Promise<{ token: string; cardBrand; last4; expMonth; expYear }>;
  refundCharge?(params: { providerPaymentRef: string; amountMinor: number }): Promise<{ providerRefundRef: string }>;
}
```

**Metadata rule (locked):** `create-checkout` and `run-monthly-billing` **must** populate
`ChargeMetadata` on every charge. `handle-payment-event` **must not** infer charge type from
amounts or offering alone — read `metadata.charge_type` and `metadata.billing_schedule_id`.

### `providers/mock.ts`

- `createCharge` stores metadata on the mock intent record.
- **Sync path for CI:** when `createCharge` completes (including off-session renewals), immediately
  emit a synthetic `payment.succeeded` event by calling the same handler as the webhook
  (`handlePaymentEventInternal`) — do **not** require a separate HTTP round-trip in tests.
- Optional dev-only HTTP simulate button remains for manual UI testing.

### `providers/stripe.ts`

- Map `ChargeMetadata` → Stripe PaymentIntent `metadata` (string values).
- Stripe logic moved out of `create-checkout` and `stripe-webhook`.

### `_shared/payments/finalise-payment.ts`

Single source of truth for successful payment side-effects:

```ts
finalisePayment(service, {
  tenantId,
  paymentRow,           // inserted payment record
  engagementId,
  chargeType,           // 'initial' | 'renewal' — from webhook metadata
  billingScheduleId?,   // required when chargeType === 'renewal'
  actorUserId?,         // null for webhook/cron
  skipDocumentEnqueue?, // false by default
})
```

#### Branch: `chargeType === 'initial'`

1. **Engagement activation** — waiver gate, `status`, `billing_status`, `payment_received_at`
   (only when engagement is not already `active`).
2. Insert `audit_log`.
3. `enqueueDocument({ documentKind: 'sale', paymentId })` unless skipped.
4. Send **payment confirmation** email (see email note below).
5. If `offerings.billing_mode === 'recurring'`: create `billing_schedule` + `saveCard` hook
   (Stage 6 details; stub OK here).

#### Branch: `chargeType === 'renewal'` (locked — do not duplicate initial logic)

Engagement is already `active`. **Must not** re-run waiver gate, flip `status` to `active`, or
insert a new `billing_schedules` row.

1. Insert `audit_log` (`action: 'renewal_payment_succeeded'`).
2. `enqueueDocument({ documentKind: 'sale', paymentId })` unless skipped.
3. Send renewal confirmation email (same template family; no receipt link required yet).
4. **`advanceBillingSchedule(billingScheduleId)`**:
   - `next_billing_date` += 1 calendar month (Jerusalem anchor)
   - `next_attempt_at` = NULL
   - `attempt_count` = 0
   - clear `last_error`

Throws if `billingScheduleId` missing when `chargeType === 'renewal'`.

#### Idempotency contract (locked — required for safe webhook replay)

`finalisePayment` **must be safe to call more than once** for the same payment row. Stripe (and
other PSPs) retry webhooks; a handler crash after `INSERT payments` but before finalise must not
leave the engagement stuck.

| Step | Replay behaviour |
| --- | --- |
| Engagement activation (`initial`) | No-op if engagement already `active` or `pending_waiver` with `payment_received_at` set |
| `billing_schedules` insert (`initial` + recurring) | No-op if schedule already exists for `engagement_id` |
| `saveCard` | No-op if default token already stored for billing account (or upsert same ref) |
| `audit_log` | Insert once per `(payment_id, action)` — skip if row exists |
| `enqueueDocument` | Idempotent via `document_queue` unique index — catch conflict, no-op |
| Confirmation email | Send only if not already sent for this `payment_id` (check audit_log or a `confirmation_email_sent_at` flag on payment if added; V1: gate on existing audit_log entry for `payment_succeeded`) |
| `advanceBillingSchedule` (`renewal`) | No-op if schedule already advanced for this billing period (e.g. `next_billing_date` > period being paid, or compare against payment `paid_at` month) |

#### Confirmation email vs legal document (locked)

Send confirmation email **immediately** after payment success. The invoicing provider document
is async — email copy must **not** promise an immediate receipt/invoice link. Wording example:
"Payment received. Your tax receipt will appear in your account shortly." Parent portal reads
`external_document_number` / `invoice_url` once the document worker completes (Stage 4).

Used by: `handle-payment-event`, `record-payment` (Stage 5), mock sync path (Stage 6 tests).

## Files to edit

### `create-checkout/index.ts`

Keep waiver/pricing resolution. Replace Stripe block with:
```ts
const provider = getPaymentProvider(tenant);
const result = await provider.createCharge({
  ...,
  metadata: {
    tenant_id: tenant.id,
    engagement_id: engagement.id,
    billing_account_id: engagement.billing_account_id,
    charge_type: 'initial',
  },
});
```

### `stripe-webhook/index.ts` → `handle-payment-event/index.ts`

- Rename directory/function.
- Resolve tenant from event metadata → load per-tenant webhook secret →
  `getPaymentProvider(tenant).constructEvent(...)` → parse `PaymentEvent.metadata`.
- On `payment.succeeded`:
  1. Validate `ChargeMetadata` (Zod).
  2. **Upsert-safe payment row:** look up by `provider_payment_ref`.
     - If **not found:** INSERT `payments` (`charge_type`, `billing_account_id`, `engagement_id`
       from metadata).
     - If **found:** use existing row — do **not** return early.
  3. **Always** call **`finalisePayment({ chargeType, billingScheduleId, paymentRow })`**
     (idempotent — see contract above).
  4. Return 200.

> **Do not** short-circuit on duplicate `provider_payment_ref`. A prior attempt may have inserted
> the payment row then crashed before finalise; replay must complete side effects.

- On `payment.failed` with `charge_type === 'renewal'`: call `applyBillingScheduleDunningFailure` (schedule dunning + email)
  (`attempt_count`, `next_attempt_at`, `last_error`) — do **not** call `finalisePayment`.
- Signature headers: `stripe-signature` / `x-mock-signature`.

### Delete `create-payment-intent/index.ts`

Stale — references removed tables. Grep for callers; delete directory.

> No shim RPCs — Stage 1 ships final names only.

## Frontend touch (minimal)

`EnrolmentPaymentForm.tsx`: mock simulate button when `payment_provider === 'mock'`.
Full polish in Stage 4.

## Definition of Done

- [ ] `payment_provider='mock'`: charge → sync event → payment row → `finalisePayment` → queue row.
- [ ] `payment_provider='stripe'`: test-mode payment works as before; metadata on PaymentIntent.
- [ ] Renewal metadata round-trip: cron charge → webhook → `finalisePayment('renewal')` → schedule advanced.
- [ ] `finalisePayment('renewal')` does **not** re-activate engagement or create schedule.
- [ ] `create-payment-intent` deleted.
- [ ] `grep stripe_` in migrations → nothing.
- [ ] `finalise-payment` used by webhook (not duplicated inline logic).
- [ ] Idempotent webhook replay (duplicate event → no duplicate payment row; finalise still runs).
- [ ] Partial-failure replay: payment row exists from prior attempt → webhook retry completes finalise.
- [ ] Confirmation email copy does not promise immediate receipt link.
- [ ] Unit tests: MockProvider sync path, Stripe event mapping, finalise-payment (initial + renewal branches).
- [ ] Committed; `main` green.

## Test cases

1. Mock charge → sync finalise → document queue row.
2. Stripe event mapping + metadata validation.
3. Idempotent webhook (duplicate delivery → one payment row, side effects applied once).
4. Partial-failure replay: insert payment, simulate finalise throw, replay webhook → engagement active + queue row.
5. Provider switch via `tenants.payment_provider`.
6. Bad signature → 400.
7. Waiver gate via finalise-payment (`initial` only).
8. Mock renewal: metadata includes `billing_schedule_id` → schedule advanced, engagement unchanged.
9. Renewal finalise without `billingScheduleId` → error.

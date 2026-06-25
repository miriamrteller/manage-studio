# Stage 5 — Cash / Offline Payment Path

> **Depends on:** Stage 2 + Stage 3 (`finalise-payment` — created in Stage 3, not here).
> **Outcome:** Flow D — admin records cash/bank transfer without payment-provider API.

## `record-payment` Edge Function

Admin-only. Input:
```ts
{ engagement_id: string; method: 'cash' | 'bank_transfer'; amount_minor?: number; note?: string }
```

Logic:
1. Verify `tenant_admin`; engagement `pending_payment` (V1).
2. Amounts via `resolveOfferingPrice()` unless override.
3. INSERT `payments`: `provider='manual'`, `payment_method=method`, `billing_account_id` from
   engagement, `created_by`/`approved_by` = caller, `status='succeeded'`, `charge_type='initial'`.
4. **`finalisePayment(...)`** — same path as card success (do not duplicate activation/enqueue).

## Frontend

Admin engagement detail → "Record payment" modal.

## Definition of Done

- [ ] Cash → manual payment, finalise-payment runs, document issued.
- [ ] Non-admin 403; waiver gate; amount override; double-submit guard.
- [ ] Committed; `main` green.

## Test cases

1. Cash full price.
2. Bank transfer override.
3. Non-admin rejected.
4. Unsigned waiver.
5. Duplicate submit rejected.

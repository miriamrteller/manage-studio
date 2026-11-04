# Account credit (plan)

**Status: PARKED until Takbull is live (owner, 4 Nov).** Plan only, nothing built. Account credit means giving a client credit instead of a refund, usable against future payments.

## What exists

- `process-refund`: admin only; partial amounts via `planRefund`; manual mode; a refund is a negative `payments` row and a refund document is queued.
- `service_credits` already exists, but it holds session credits (makeups), not money. Keep it separate and never call it "credit" in the UI. Proposed UI name: "Account credit (₪)".

## Admin

- In the refund dialog: "Give credit instead" (full or partial, same amount rules as `planRefund`). The reason is prefilled ("Credit instead of refund") and editable; never required.
- On the client page: "Add credit" with an amount and a reason (goodwill, correction).
- Nothing goes to the payment provider: the money stays with the studio.

## Client

- Portal shows "Your credit: ₪X".
- Pay page / payment request: "Credit ₪X applied, ₪Y to pay". If credit covers everything, there's no card step.

## Storage

- New `account_credit_entries` ledger: tenant, payer (person/account), signed `amount_minor`, kind (`issued` / `applied` / `expired` / `reversed`), source payment, applied-to payment, reason, `created_by`, `expires_at`.
- Insert-only: no UPDATE/DELETE (grants + trigger). Corrections are `reversed` entries. Every insert writes `audit_log`.
- Balance = sum of entries, through one RPC with a row lock, so it can never go below zero.
- Using credit writes a `payments` row: provider `manual`, new `payment_method` `account_credit`.

## Tax documents (all [[ACCOUNTANT: confirm]])

- Recommended default: when credit is issued, no credit note; the original document stands. When credit is used, the new sale's document lists the credit as its payment.
- Alternative: credit note when issued, then a new document when used.
- Per provider:
  - Takbull: `customPayments`, the same path as Bit ([TAKBULL-INTEGRATION.md](TAKBULL-INTEGRATION.md) §4).
  - Green Invoice: payment type "other" (11).
  - YPay: no credit method in its list → `not_issued` with a reason.
  - Grow / iCount / Invoice4U: can't issue standalone documents → `not_issued`.

## Expiry

- Default: no expiry. An optional per-credit date, editable. An `expired` ledger entry is written by a daily job.
- [[LAWYER: confirm]] whether consumer-protection rules limit expiry of prepaid credit.

## Accountant

- Export column method "Account credit".
- New "Credits" CSV (same language choice).
- VAT summary line: "Open credit balance (owed to clients)".
- Credit-funded sales count by their document as usual.

## PRs

1. (M) Ledger, RPCs (issue / apply / reverse, row-locked), security tests, `definer-execute.json`, `account_credit` method.
2. (M) Admin issue from the refund dialog + manual; client page balance.
3. (M) Apply to job payment requests and booking checkout; documents per provider.
4. (M) Apply to enrolment checkout and monthly billing (run before charging the token; skip the charge if covered).
5. (S) Accountant: export method, Credits CSV, open-balance line; docs + lawyer list.

## Open questions (recommended default first)

1. Apply credit automatically, or offer it? Default: applied automatically and shown; the admin can switch it off on a request.
2. Can credit be turned back into a cash refund later? Default: yes, as a manual refund that writes a `reversed` entry.
3. Whose credit is it: the person or the family account? Default: whoever paid (the billing account if there is one, else the person).
4. Expiry: none by default.
5. Credit note at conversion? Default: no (accountant decides).

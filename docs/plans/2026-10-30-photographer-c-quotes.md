# Photographer Thread C — Quotes + automatic emails

Target: Thu 2026-11-05 (not part of the Nov 1 beta). Branch `photographer/c-quotes`.
Owns migration `20261030000300_quotes.sql` only (additive, SPEC §2.5.3).

## Shared contract (written against, not owned)

Thread A landed as `20261030000100_job_details.sql` with **different names** from the brief
(`job_details` / `job_status` / `convert_lead_to_job`). C is rebased onto `photographer/a-shoots` and uses A's real objects.

| Owner | Object | How C uses it |
| ----- | ------ | ------------- |
| A | `job_details(engagement_id PK, tenant_id, job_status, location, notes, lead_id, gallery_url, gallery_released_at)` | Acceptance upserts `job_status='booked'`; cron reads status / gallery fields |
| A | `job_resolve_client` + `job_insert` (service-only helpers) | Lead conversion on acceptance. **Not** `convert_lead_to_job`: it requires `auth.uid()` to be a tenant admin, and the accepting client is anonymous. accept_quote mirrors it (lead marked converted + audit row) |
| A | job package | `job_insert` needs an offering: first included package line, else the lead's `offering_id`. `mark_quote_sent` refuses a lead quote without one |
| A | client phone | `people` has no phone column; A stores it in `emergency_contact_phone` |
| B (`20261030000200`, not landed yet) | `create_shoot_payment_requests(p_engagement_id uuid, p_requests jsonb)` with `{label, amount_minor, due_date, max_installments}` | Called with deposit + balance. Return value ignored (`PERFORM`). Re-check the name when B lands |
| A | shoot date | `engagements.booked_starts_at` (Asia/Jerusalem), falling back to `quotes.shoot_date`. Lead conversions create an undated job (A: one undated active job per client + package) |
| A | contract send | `quotes.send_contract_on_accept` flag is returned by acceptance; the edge function hook is a no-op until A's flow lands |

## Data

- `quotes` — client = lead or account (+ optional existing shoot). Must have `lead_id` or `engagement_id` so acceptance can always produce a shoot.
  `public_token` is 256 random bits (two UUIDv4, no pgcrypto dependency).
- `quote_lines` — offering optional, qty × unit price (gross minor units), `is_optional`/`is_selected`.
- Totals are **gross** (SPEC §2.5.1 — the invoicing provider owns the VAT split). Deposit = `round_half_up(total × deposit_percent / 100)`, balance = total − deposit.
  SQL (`quote_recalc_totals` + trigger) and TS (`computeQuoteTotals` in `packages/shared/src/quote-pricing.ts`) implement the same formula and share test fixtures.
- Lines and financial fields are locked once a quote is accepted/declined/expired.
- `tenant_automatic_emails` (per-tenant toggle, missing row = on) and `automatic_email_log` (one send per email × quote/shoot; claim/complete RPCs).

## RPCs

| RPC | Caller | Notes |
| --- | ------ | ----- |
| `save_quote(p_quote jsonb, p_lines jsonb)` | tenant_admin | Atomic upsert + line replace |
| `mark_quote_sent(p_quote_id, p_via)` | tenant_admin | draft/sent → sent |
| `get_public_quote(p_token, p_tenant_id)` | anon | Sent/accepted/declined/expired only; no PII beyond the client's own name |
| `decline_public_quote(p_token, p_tenant_id, p_reason)` | anon | |
| `accept_quote(p_token, p_tenant_id, p_selected_line_ids)` | service_role (via `accept-quote` edge fn) | ONE transaction, row lock, idempotent |
| `claim_automatic_email` / `complete_automatic_email` / `list_due_shoot_emails` | service_role | cron + edge |

### Acceptance transaction

1. `SELECT … FOR UPDATE` the quote by token + tenant. Already accepted → return stored result with `already_accepted: true` (double-click safe; the second click waits on the lock).
2. Reject draft / declined / cancelled-shoot; mark expired when `valid_until` < today (Jerusalem).
3. Apply the client's optional-line selection, recalc totals.
4. No engagement → `job_resolve_client` + `job_insert`, lead marked converted. Upsert `job_details.job_status='booked'`.
5. `create_shoot_payment_requests` with deposit (due today) + balance (due on shoot date, never in the past). Zero parts are omitted.
6. Mark accepted, store result, `audit_log` row (`quote_accepted`, actor null = client).

## Automatic emails (fixed set)

`quote_sent`, `booking_confirmed`, `shoot_reminder` (2 days before), `shoot_thank_you` (day after), `gallery_ready`.
React Email templates (he/en) pre-rendered to Deno shells (`scripts/build-photographer-email-shells.mjs`, same pattern as admin announcements).

- quote_sent — admin "Send" → `send-notification` (email). WhatsApp opens a prefilled wa.me share (send-notification's WhatsApp path needs a Twilio template SID and does not pass variables yet).
- booking_confirmed — `accept-quote` edge fn, first acceptance only.
- reminder / thank-you / gallery — `run-shoot-emails` cron (hourly), windows tolerate missed runs; the log makes each send happen once.

## UI

- `/admin/quotes` list + automatic-email toggles; `/admin/quotes/new?lead=…|engagement=…`; `/admin/quotes/:id`.
- "Create quote" on each lead row; `CreateQuoteButton` exported for A's shoot page.
- `/quote/:token` public page (tenant branding via AppLayout, Hebrew RTL, logical CSS).

## Tests

- `quote-totals.test.ts` — gross totals, deposit rounding, optional selection.
- `quotes-migration.test.ts` — static SQL contract (lock, idempotency branch, call order, grants, RLS).
- `supabase/tests/quotes/run.sh` — applies Thread A's real migration + this one to a local Postgres (base tables and B's RPC stubbed) and asserts acceptance, idempotency (incl. a two-session race), gross totals, locks, RLS, email claims.

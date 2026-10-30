# Photographer Thread C — Quotes + automatic emails

Target: Thu 2026-11-05 (not part of the Nov 1 beta). Branch `photographer/c-quotes`.
Owns migration `20261030000300_quotes.sql` only (additive, SPEC §2.5.3).

## Shared contract (written against, not owned)

The owner renamed the contract to vertical-neutral names: `job_details` / `job_status` /
`convert_lead_to_job` (Thread A, `20261030000100_job_details.sql`) and `job_payment_requests` /
`create_job_payment_requests` (Thread B, `20261030000200_job_payment_requests.sql`). C is rebased onto
`photographer/a-shoots`; B's migration is applied by the SQL test harness.

| Owner | Object | How C uses it |
| ----- | ------ | ------------- |
| A | `job_details` | Acceptance upserts `job_status='booked'`; cron reads status / `gallery_released_at` |
| A | `job_resolve_client` + `job_insert` (service-only helpers) | Lead conversion on acceptance. **Not** `convert_lead_to_job`: it requires a signed-in tenant admin and the accepting client is anonymous. Mirrors it (lead converted + audit row); reuses the lead's live job if the admin already converted it |
| A | job package | `job_insert` needs an offering: first included package line → lead's `offering_id` → the tenant's hidden "Custom shoot" package (appointment, not public, price 0). Price always lives on the quote + payment requests |
| A | client phone | `contact_preferences.whatsapp_number` (people has no phone column) |
| A | contract | `send-job-contract-link` needs an admin session, so the accepted-quote admin panel offers "Send contract" when the quote asked for it |
| B | `job_payment_requests` | Acceptance inserts deposit + balance rows directly, mirroring `create_job_payment_requests` (same columns, same `job_payment_request.created` audit action) because that RPC requires a signed-in tenant admin |
| B | gallery | `gallery_ready` email fires on the admin release (`release_job_gallery` → `gallery_released_at`) |

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
4. No engagement → reuse the lead's live job or `job_resolve_client` + `job_insert`, lead marked converted. Upsert `job_details.job_status='booked'`.
5. `job_payment_requests` rows: deposit (due today) + balance (due on shoot date, never in the past). Zero parts are omitted.
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
- `supabase/tests/quotes/run.sh` — applies Threads A's and B's real migrations + this one to a local Postgres (base tables stubbed) and asserts acceptance, idempotency (incl. a two-session race), gross totals, locks, RLS, email claims.

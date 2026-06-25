# Stage 9 — Monitoring, Alerting & Invoicing Health

> **Depends on:** Stage 2 (`document_queue`), Stage 6, Stage 8.
> **Outcome:** Alerts, auth health, dashboard, queue retention.

## 1. Dead-letter alert

Inline in `issue-document` when queue → `dead`: email admin once per row.

## 2. Stale processing recovery (verify in prod)

Stage 2's `issue-document` batch mode resets rows stuck in `processing` for >15 minutes back to
`pending` (uses `processing_started_at`). Stage 9 DoD verifies this runs via the existing
`document-queue-retry` cron (`*/15 * * * *`). No separate cron required unless ops wants a
dedicated sweep — batch step 0 is sufficient.

Dashboard finance health card should include count of rows in `processing` >15 min (stuck indicator).

## 3. Invoicing auth health

`check-invoicing-auth` Edge Function (cron, `CRON_SECRET`):
- Tenants with `invoicing_account_id IS NOT NULL` (batch limit per run if needed).
- `getInvoicingProvider(tenant).checkAuthHealth?.(service, tenantId)`.
- Update `invoicing_auth_valid_until`, `invoicing_auth_checked_at`.
- Email if expiring within 14 days.

Weekly cron Monday 09:00 (document in runbook).

## 4. Dashboard finance health card

- `document_queue WHERE status IN ('pending','dead')`.
- Stuck `processing` count (`processing_started_at < now() - 15 min`).
- Suspended engagements + schedules.
- Filtered list links.

## 5. Queue retention

Weekly cron: **DELETE** `document_queue` rows where `status = 'succeeded'` AND
`succeeded_at < now() - interval '30 days'`. (No payload column to redact.)

## 6. SPEC §7 checklist

Payment + invoicing credentials, webhook, crons, smoke test.

## Definition of Done

- [ ] Dead row → single alert.
- [ ] Stale processing rows recover on next batch cron; dashboard shows stuck count.
- [ ] Auth check + reminder email (mock threshold).
- [ ] Dashboard counts.
- [ ] Retention cron deletes old succeeded rows.
- [ ] SPEC updated.
- [ ] Committed; `main` green.

## Test cases

1. Dead alert once.
2. Stale `processing` row → next batch resets to `pending`.
3. Auth expiry reminder.
4. Dashboard counts (including stuck processing).
5. Retention deletes aged succeeded rows.
6. Cron SQL applies cleanly.

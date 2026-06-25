# Grow live sandbox E2E verification (paste into new agent chat)

## Mission

Execute and document **manual end-to-end verification** of Grow (Meshulam) on a real sandbox tenant. Code is shipped (G0–G7); this plan is **operational QA only** — no feature code unless a bug is found.

**Repo:** `manage-studio`  
**SPEC / docs:** [finance/00-overview.md](finance/00-overview.md) · [GROW-RUNBOOK.md](finance/GROW-RUNBOOK.md)  
**Blocked when:** No Meshulam sandbox account, no SHAAM connection, or `GROW_MOCK=true` only  
**Out of scope:** Production go-live, Stripe path, new payment features

---

## Prerequisites checklist

Before starting, confirm:

- [ ] Meshulam/Grow **sandbox** account + payment page created
- [ ] Sandbox credentials: `userId`, `pageCode`, `apiKey`
- [ ] App encryption: Postgres GUC `app.encryption_key` set (local + deployed)
- [ ] Edge functions deployed: `verify-grow-credentials`, `create-checkout`, `handle-payment-event`, `handle-invoice-event`
- [ ] Public webhook URL reachable by Grow (`GROW_NOTIFY_URL` / deployed function URL)
- [ ] IL test tenant with `payment_provider = 'grow'`, `invoicing_provider = 'grow'`
- [ ] VAT fields set on tenant (`vat_rate`, `prices_include_vat`, business type)
- [ ] **Not** running with `GROW_MOCK=true` for this test

---

## Environment matrix

| Environment | `GROW_API_BASE` | Notes |
| --- | --- | --- |
| Sandbox | `https://sandbox.meshulam.co.il/api/light/server/1.0` | Default in code |
| Production | Production base URL | **Do not use** for this plan |

Record in test notes: app URL, tenant subdomain, test admin email, date.

---

## Step 1 — Credential save + health check

1. Log in as `tenant_admin`
2. Navigate `/admin/setup/grow`
3. Enter sandbox credentials → Save
4. Click **Test connection** (`FinanceHealthCard` / form button)
5. **Expected:** Connected message from `verify-grow-credentials`

**If fail:** capture response body, check encrypted secret round-trip, `GROW_API_BASE`, network egress.

---

## Step 2 — Mock path regression (sanity before live charge)

Ensure mock path still passes (CI/dev safety net):

```bash
pnpm -C apps/web exec playwright test --grep @finance-local
# OR visit /admin/dev/finance-walkthrough with GROW_MOCK=true
```

**Expected:** Walkthrough completes without live API.

---

## Step 3 — Sandbox checkout (₪1 test offering)

1. Create or pick test offering with minimal price (₪1 if allowed)
2. Complete enrolment to `pending_payment` (admin or parent flow)
3. Open pay link → Grow checkout shell loads (`create-checkout`)
4. Complete payment on Meshulam sandbox UI (test card per Grow docs)

**Expected sequence:**

| Step | System behavior |
| --- | --- |
| Redirect to Grow | `pageUrl` returned |
| Payment notify webhook | `handle-payment-event` finalises payment → `payments.status = succeeded` |
| Document notify | `handle-invoice-event` sets `external_document_id`, `invoice_url` on payment |
| Parent/admin UI | Payment visible; invoice link opens PDF |

**Verify in DB:**

```sql
SELECT id, status, total_amount_minor, external_document_number, invoice_url, paid_at
FROM payments WHERE tenant_id = :tenant ORDER BY created_at DESC LIMIT 1;

SELECT status FROM engagements WHERE id = :engagement_id;
-- expected: active (or per business rules after pay)
```

---

## Step 4 — Admin finance UI

1. `/admin/finance` — revenue MTD includes test payment
2. `/admin/finance/payments` — row with VAT columns populated
3. Admin student slide-over — payment recorded with document number
4. Parent portal — payment history shows invoice link

---

## Step 5 — Refund smoke (same day)

1. From admin payments UI, issue **full refund** for sandbox payment (same day — Grow constraint)
2. **Expected:** Refund succeeds; negative payment row or refund status per finance module design
3. Late/partial refund: document Grow error surfaces in modal (expected failure path)

---

## Step 6 — Webhook ordering edge case (optional)

If possible, replay or observe document notify arriving **before** payment notify:

- **Expected:** No duplicate documents; idempotent finalise per GROW-RUNBOOK §5

---

## Step 7 — Document results

**Update:** `docs/IMPLEMENTATION_STATUS.md` Grow row:

- Change *"live sandbox E2E still manual"* → ✅ with date + tester initials **OR** keep blocked with reason

**Optional:** Append run log to `docs/plans/finance/GROW-RUNBOOK.md` §7 checklist with checked boxes.

---

## Bug found protocol

If E2E fails:

1. Capture webhook payload samples (redact secrets) in issue notes
2. Fix in minimal PR scoped to finance/Grow — reference this plan
3. Re-run Steps 1–5

**Do not** widen scope to unrelated finance refactors.

---

## Definition of done

- [ ] Steps 1–4 pass on sandbox
- [ ] Step 5 attempted (pass or documented Grow limitation)
- [ ] IMPLEMENTATION_STATUS updated
- [ ] No code changes **OR** bugfix PR linked with re-verification

---

## Out of scope

- Production merchant onboarding
- SHAAM production allocation numbers
- Monthly billing cron (`run-monthly-billing`) unless explicitly testing renewals
- Stripe parallel path

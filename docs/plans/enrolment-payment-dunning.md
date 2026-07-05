# Phase 1E / §6.x #8 — Enrolment unpaid payment dunning (follow-on)

**Status:** **Blocked** on [payment-dunning-notifications.md](payment-dunning-notifications.md) (collections layer + Step 0 migration)

## Mission

Automated Day 3 / 7 / 14 **`PAYMENT_REMINDER`** emails for engagements stuck in **`pending_payment`**, using the **same collections module** shipped in the renewal plan — **not** a new dunning engine.

**Depends on:**

- Step 0 migration (`engagements.payment_dunning_*`, `idx_notification_log_dunning_key`) ✅ from renewal PR
- `_shared/collections/send-payment-dunning-reminder.ts` with `kind: 'enrolment_unpaid'` ✅ stub extended in this PR

**Out of scope:** Renewal billing · waiver reminders · admin manual link (keeps working as override)

---

## V1 architecture (locked — inherit from renewal plan)

| Layer | Enrolment unpaid |
| --- | --- |
| **Obligation SSOT** | `engagements.payment_dunning_attempt_count`, `payment_dunning_next_at` |
| **Lifecycle SSOT** | `engagements.status` (`pending_payment` until paid or cancelled) |
| **Collections** | `sendPaymentDunningReminder({ kind: 'enrolment_unpaid', ... })` |
| **Idempotency** | `dunning_key = enrolment_unpaid:<engagement_id>:<attempt_count>` |
| **CTA** | Fresh signed enrolment pay URL (`signWaiverToken` / existing admin-link pattern) |
| **Retry charge?** | **No** — reminders only; parent pays via link |

Do **not** use `billing_schedules` for this track.

---

## Locked policy (draft — confirm before implementation)

| Attempt | Day | Action |
| --- | --- | --- |
| 1 | +3 from `created_at` or first dunning start | Email reminder |
| 2 | +7 | Email reminder (urgent copy) |
| 3 | +14 | Email + optional admin notify; **cancel engagement?** — confirm with product (SPEC fuzzy) |

Timezone: **`Asia/Jerusalem`** (match billing).

---

## Implementation sketch (agent plan TBD)

1. **`run-enrolment-payment-dunning`** edge function (service role, `CRON_SECRET`) — mirror `send-waiver-reminder` batch pattern.
2. Select `engagements` where `status = 'pending_payment'` AND `payment_dunning_next_at <= now()` AND attempt < 3.
3. Increment `payment_dunning_attempt_count`, set next `payment_dunning_next_at` per ladder.
4. Build pay URL via existing token/signing helpers (reuse `send-admin-enrolment-link` URL logic, extracted to shared helper).
5. Call `sendPaymentDunningReminder` with `kind: 'enrolment_unpaid'`.
6. Terminal step: TBD (cancel engagement vs leave `pending_payment` for admin).

---

## Pre-flight (when unblocked)

1. [payment-dunning-notifications.md](payment-dunning-notifications.md) — collections module
2. `supabase/functions/send-waiver-reminder/index.ts` — cron batch pattern
3. `supabase/functions/send-admin-enrolment-link/index.ts` — pay URL + email vars
4. SPEC §6.x #8 · Phase 1E dunning Day 3/7/14 prose

---

## Definition of done (future)

- [ ] Cron registered (pg_cron or external scheduler — document in §7 runbook)
- [ ] `buildDunningEmailContext` implements `enrolment_unpaid` copy (EN + HE)
- [ ] Idempotency via shared `dunning_key`
- [ ] Tests for ladder + skip when not `pending_payment`
- [ ] `docs/IMPLEMENTATION_STATUS.md` §6.x #8 → ✅

**Not agent-ready until renewal collections PR merges.**

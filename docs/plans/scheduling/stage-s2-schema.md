# Scheduling S2 — booking schema (SSOT)

**Status:** Implemented · migrations `003400`–`003500` (base), plus `003700`–`004200` (offering type, grants, hours RPC, pending_waiver occupancy).

Part of [00-overview.md](00-overview.md). Reuses `engagements` as the booking source of truth — **no** parallel `appointments` / `booking_services` tables.

---

## Tables

### `tenant_scheduling_settings` (1 row / tenant)

| Column | Type | Notes |
| --- | --- | --- |
| `tenant_id` | uuid PK → tenants | |
| `buffer_mins` | int | gap between appointments |
| `slot_duration_mins` | int | default appointment length |
| `max_per_day` | int null | null = unlimited |
| `advance_notice_hrs` | int | minimum notice before a slot |
| `booking_window_days` | int | how far ahead clients can book |
| `hold_expiry_mins` | int | RESERVED hold TTL; one of 15,20,25,30,45,60,90,120 (default 20) |
| `expiry_reminder_mins` | int null | pre-expiry nudge; 5/10/15 or null=off |
| `is_booking_enabled` | bool | master switch for `/book` |
| `late_cancel_hours` | int | S5 — hours before start for late cancel (default 24) |
| `retain_payment_on_penalty` | bool | S5 — set `engagements.penalty_applied_at` on paid no-show/late cancel |

### `tenant_scheduling_hours` (weekly windows)

`day_of_week` (0=Sun..6=Sat), `start_time`, `end_time`, `is_active`. Times are wall-clock in `Asia/Jerusalem`.

**Replace-all:** admin UI calls `replace_tenant_scheduling_hours(p_hours jsonb)` — delete + insert in one transaction (`04100`). Do not client-side delete-then-insert.

### `scheduling_holds` (short-lived reservations)

`offering_id`, `starts_at`, `ends_at`, `expires_at`, `client_name`, `client_email`, `client_phone`, `engagement_id` (set once a booking is created), `reminder_sent_at`, `released_at`.

Open hold = `released_at IS NULL AND expires_at > now()`.

`prepare-booking-checkout` requires `body.client_email` to match `hold.client_email` (case-insensitive).

### `scheduling_blocks` (from `003300`)

Manually blocked time; `event_type = 'blocked'` in the calendar feed.

---

## Extended tables

### `engagements` (+ appointment columns)

`booked_starts_at`, `booked_ends_at` (both-null or both-set check), `google_event_id`, `scheduling_hold_id`, `penalty_applied_at` (S5).

Lifecycle for appointments:

```
pending_payment → active | pending_waiver  (on paid finalise)
pending_payment → cancelled                (hold expiry, or slot taken on late pay)
active | pending_waiver → cancelled        (admin cancel / no-show; reasons admin_cancelled | late_cancellation | no_show)
```

`finalise-payment` never reactivates `cancelled` / `withdrawn`. If another engagement already owns the slot, the loser is cancelled with `slot_taken_on_payment`.

### `offerings`

| Column | Notes |
| --- | --- |
| `offering_type` | `'class'` \| `'appointment'` (`03700`; replaces dropped `is_bookable`) |
| `duration_mins` | Appointment length; falls back to settings when null |
| `start_time` / `end_time` / `day_of_week` | Required for classes; null for appointments |

---

## RPCs

| RPC | Grants | Purpose |
| --- | --- | --- |
| `get_available_slots(subdomain, offering_id, date)` | anon, auth | Candidates minus holds / booked (`pending_payment`\|`active`\|`pending_waiver`) / blocks. Google freebusy layered by Edge. |
| `create_scheduling_hold(...)` | anon, auth | Advisory-locked; same occupancy set; returns `hold_id`, `expires_at`. |
| `release_scheduling_hold(hold_id)` | anon, auth | Idempotent if not linked to an engagement. |
| `get_bookable_offerings_by_subdomain` | anon, auth | Active appointment offerings when booking enabled. |
| `get_schedule_events(tenant_id, start, end)` | auth (admin) | Classes + sessions + blocks + appointments (incl. pending_waiver). |
| `replace_tenant_scheduling_hours(p_hours)` | auth (admin) | Atomic hours replace. |
| `get_google_calendar_connection` | auth | Connected? + email (no tokens). |
| `save_tenant_google_credentials` / `get_tenant_google_credentials` | service_role | Encrypted token I/O (`search_path` includes `extensions`). |

---

## Concurrency

`create_scheduling_hold` takes `pg_advisory_xact_lock(hashtext(tenant_id))` before re-checking overlaps.

---

## Expiry (cron → `expire-scheduling-holds`)

Every minute: optional pre-expiry reminder, then release holds past `expires_at`. Linked engagements that are still `pending_payment`, unpaid, and have `booked_starts_at` are cancelled with reason `booking_hold_expired`. Group-class dunning is never affected.

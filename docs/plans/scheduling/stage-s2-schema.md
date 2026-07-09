# Scheduling S2 — booking schema (SSOT)

**Status:** Implemented · migrations `003400` (schema + RPCs) and `003500` (cron).

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

### `tenant_scheduling_hours` (weekly windows)

`day_of_week` (0=Sun..6=Sat), `start_time`, `end_time`, `is_active`. Times are wall-clock in `Asia/Jerusalem`.

### `scheduling_holds` (short-lived reservations)

`offering_id`, `starts_at`, `ends_at`, `expires_at`, client contact fields, `engagement_id` (set once a booking is created), `reminder_sent_at`, `released_at`. Open hold = `released_at IS NULL AND expires_at > now()`.

### `scheduling_blocks` (from `003300`)

Manually blocked time; `event_type = 'blocked'` in the calendar feed.

---

## Extended tables

### `engagements` (+ appointment columns)

`booked_starts_at`, `booked_ends_at` (both-null or both-set check), `google_event_id` (S3d), `scheduling_hold_id`. Appointment engagements are ordinary engagements with `booked_*` set; they flow through the same `pending_payment → active` checkout lifecycle.

### `offerings` (+ bookable flags)

`is_bookable` (1:1 service vs group class), `duration_mins` (fallback to settings when null).

---

## RPCs

| RPC | Grants | Purpose |
| --- | --- | --- |
| `get_available_slots(subdomain, offering_id, date)` | anon, auth | Candidate slots minus holds/booked/blocks; Jerusalem TZ; enforces notice/window/max-per-day. Google freebusy layered in by S3c. |
| `create_scheduling_hold(subdomain, offering_id, starts_at, ends_at, name, email, phone)` | anon, auth | Advisory-locked per tenant; re-validates then inserts hold; returns `hold_id`, `expires_at`. |
| `release_scheduling_hold(hold_id)` | anon, auth | Idempotent release (only if not yet linked to an engagement). |
| `get_schedule_events(tenant_id, start, end)` | auth (admin) | Extended in `003400` to include `appointment` rows from booked engagements. |

---

## Concurrency

`create_scheduling_hold` takes `pg_advisory_xact_lock(hashtext(tenant_id))` before re-checking overlaps, preventing double-booking under concurrent requests for a single-provider (per-tenant V1) calendar.

---

## Expiry (cron `003500` → `expire-scheduling-holds`)

Every minute: send pre-expiry reminder (once, if `expiry_reminder_mins` set), then release holds past `expires_at`. Linked engagements that are still `pending_payment`, unpaid, and have `booked_starts_at` are cancelled with reason `booking_hold_expired`. Group-class dunning is never affected.

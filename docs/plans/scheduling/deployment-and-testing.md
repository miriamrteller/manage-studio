# Scheduling — Deployment, Environments & Testing

Operational runbook for the native scheduling feature (calendar view, slot booking,
Google Calendar sync). Covers what to deploy, how `APP_URL` and secrets flow through
each layer, what to switch when moving between environments, and how to test.

Related: [00-overview.md](00-overview.md) · [google-calendar-integration.md](google-calendar-integration.md) · [stage-s2-schema.md](stage-s2-schema.md)

---

## 1. Where configuration actually lives

There are two independent layers with **different** config mechanics. This is the
key to the "do we need to switch `APP_URL`?" question.

| Layer | How it gets its URL/secrets | Switch per environment? |
| --- | --- | --- |
| **Frontend SPA** (`apps/web`) | `window.location.origin` at runtime; Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` baked in at **build time** | **No** for URLs (origin is derived). Only rebuild if the Supabase project changes. |
| **Edge Functions** (`supabase/functions`) | `Deno.env.get(...)` from **Supabase's hosted secret store** (set via `supabase secrets set`) — **not** the repo `.env` at runtime | **Yes** — secrets are per Supabase project. |

**Consequence:** deployed Edge Functions never read your local `.env`. `.env` is only
used by (a) the Vite build for `VITE_*` vars and (b) local scripts that push secrets.
So `APP_URL` must be set as a Supabase secret for the environment you're running against.

---

## 2. `APP_URL` — every consumer and the coupling that matters

`APP_URL` is the **public URL of the SPA** (front door in the browser), e.g.
`http://localhost:5173` (dev) or `https://app.creativeballetacademy.com` (prod).
It is **not** `VITE_SUPABASE_URL` (that is the backend API).

Edge Functions that read `APP_URL`:

- `google-calendar-oauth-start` — builds the OAuth `redirect_uri` = `{APP_URL}/admin/setup/integrations/google/callback`
- `google-calendar-oauth-callback` — validates the flow
- `expire-scheduling-holds` — "book again" / reminder email links (`{APP_URL}/book`)
- `finalise-payment`, `run-enrolment-payment-dunning`, `send-waiver-reminder`,
  `send-notification`, `send-admin-*` — existing email/redirect links (unchanged by scheduling)

The frontend does **not** use `APP_URL` — the callback page and enrol links all use
`window.location.origin`, so they auto-match wherever the app is served.

### The one coupling to keep in sync

```
Supabase secret APP_URL  ──►  redirect_uri sent to Google  ──►  must match a
                                                                 Google Console
                                                                 Authorized redirect URI
```

Google allows **multiple** Authorized redirect URIs on one OAuth client. Register both
up front so you never touch Google again when switching environments:

```
http://localhost:5173/admin/setup/integrations/google/callback
https://app.creativeballetacademy.com/admin/setup/integrations/google/callback
```

Then the **only** thing that changes per environment is the Supabase `APP_URL` secret.

> Caveat: `APP_URL` is shared with email/redirect links across the app. Do not leave a
> production project's `APP_URL` pointed at localhost — it will break emailed pay/waiver links.

---

## 3. Secrets

Scheduling introduces only two **new** secrets; the rest already exist in the project
(verified via `supabase secrets list`: `APP_URL`, `CRON_SECRET`, `WAIVER_LINK_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`).

| Secret | Purpose | New? |
| --- | --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client id | **New** |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google OAuth client secret | **New** |
| `GOOGLE_CALENDAR_MOCK` | `true` = stub free/busy + event insert/delete (dev, mirrors `GROW_MOCK`) | **New (optional)** |
| `APP_URL` | SPA public URL (see §2) | exists |
| `CRON_SECRET` | authorises the hold-expiry cron POST | exists |
| `WAIVER_LINK_SECRET` | signs the booking→pay handoff token | exists |

Set them:

```bash
supabase secrets set GOOGLE_CALENDAR_CLIENT_ID="..."
supabase secrets set GOOGLE_CALENDAR_CLIENT_SECRET="..."
# dev-only stub instead of real Google:
supabase secrets set GOOGLE_CALENDAR_MOCK="true"
```

### `.env` naming gotcha

The repo `.env` currently has `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The code
reads `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`. Rename them so any
env-file-based sync picks up the right keys.

---

## 4. Deploy

### Migrations (already applied to remote)

`20260608003100`–`20260608003600`. Apply with `pnpm db:push` then regenerate types with
`pnpm db:types`. (Local `supabase db reset` needs Docker Desktop running.)

### Edge Functions

New (public / no user JWT — deploy with `--no-verify-jwt`):

```bash
supabase functions deploy prepare-booking-checkout --no-verify-jwt
supabase functions deploy get-available-slots --no-verify-jwt
supabase functions deploy expire-scheduling-holds --no-verify-jwt
```

New (admin / authenticated — keep JWT verification):

```bash
supabase functions deploy google-calendar-oauth-start
supabase functions deploy google-calendar-oauth-callback
supabase functions deploy google-calendar-disconnect
supabase functions deploy google-calendar-freebusy
supabase functions deploy google-calendar-sync-event
```

**Redeploy (shared `finalise-payment.ts` changed — bundles the GCal sync-on-confirm):**

```bash
supabase functions deploy handle-payment-event
supabase functions deploy record-payment
```

### `config.toml`

Add `verify_jwt = false` entries for the three public scheduling functions so the setting
survives future syncs (matches the pattern used for `create-checkout` etc.).

---

## 5. Environment switch checklist (local ⇄ prod)

When pointing the same Supabase project at a different frontend origin:

- [ ] `supabase secrets set APP_URL="<origin>"`
- [ ] Confirm `<origin>/admin/setup/integrations/google/callback` is registered in Google Console (pre-register both to skip this)
- [ ] Frontend: no change (uses `window.location.origin`); rebuild only if `VITE_SUPABASE_*` changed
- [ ] After testing on localhost, restore `APP_URL` to the production origin (shared with email links)

If you use **separate** Supabase projects per environment, each project holds its own
secret set — nothing to switch, just set each project once.

---

## 6. Testing plan

### 6.1 Feature flags
- Enable `scheduling:calendar.view`, `scheduling:booking.client`, `scheduling:booking.admin`
  (and optionally `scheduling:integration.google_calendar`) for the test tenant.
- Verify nav items + `/admin/setup/calendar`, `/admin/setup/booking`, `/book` gate correctly
  (hidden/blocked when the flag is off).

### 6.2 Calendar view (S1)
- Create offerings (weekly `day_of_week` + `start_time`/`end_time`) and `offering_sessions`.
- `/admin/setup/calendar` shows classes (blue), sessions (teal), blocks (grey); times render
  in `Asia/Jerusalem`; RTL/Hebrew layout correct.
- Drag-create a block → row in `scheduling_blocks` → appears on the calendar.

### 6.3 Availability + holds (S2)
- In `/admin/setup/booking`: enable booking, set weekly hours, slot duration, buffer,
  advance notice, window, `max_per_day`, hold expiry.
- Mark an offering `is_bookable`.
- `get_available_slots` (via `/book`) respects hours, duration+buffer step, advance notice,
  booking window, and excludes existing holds / booked engagements / blocks.
- Concurrency: two rapid holds on the same slot → second fails ("slot no longer available")
  (advisory-lock path in `create_scheduling_hold`).

### 6.4 Booking → payment (S3) — use Mock provider
- `/book` → pick service/date/slot → details → hold created.
- `prepare-booking-checkout` creates guest `people` row + `pending_payment` engagement with
  `booked_starts_at/ends_at`, links the hold, mints token, redirects to `/enrol/pay/:id?t=...`.
- Complete Mock payment → `finalise-payment` sets engagement `active` + `payment_received_at`.
- **No** "confirmed" screen appears before finalisation.
- Repeat booking of the same service by the same person succeeds (no-season unique index
  exempts `booked_starts_at`).
- Waiver note: bookable offerings default `waiver_required = true`; if the tenant has an
  active consent template, the completion flow includes a waiver step. Set the offering's
  `waiver_required = false` to skip.

### 6.5 Hold expiry cron (S2)
- Create a hold with a short expiry; wait for `expire-scheduling-holds` (every minute) or
  invoke manually with the `x-cron-secret` header.
- Expired unpaid appointment engagement → `cancelled` (reason `booking_hold_expired`); hold
  `released_at` set; slot frees up.
- **Regression:** group-class `pending_payment` engagements (no `booked_starts_at`) are
  untouched — dunning still runs normally.
- Pre-expiry reminder email sent at most once when `expiry_reminder_mins` is set.

### 6.6 Google Calendar (S3b–S3d)
- **Mock first** (`GOOGLE_CALENDAR_MOCK=true`): connect flow, free/busy returns empty,
  event insert/delete return fake ids — exercises the full path without a Google project.
- **Real:** `/admin/setup/booking` → Connect Google → consent → redirected back →
  `get_google_calendar_connection` shows connected + email.
- Free/busy: a busy block in the connected Google calendar removes the overlapping slot in
  `/book`. If free/busy errors, availability **fails closed** (no slots) — verify.
- Sync on confirm: paid booking creates a Google event; `engagements.google_event_id` set.
- Cancel in admin appointments → `google-calendar-sync-event` deletes the event;
  `google_event_id` cleared.
- Disconnect nulls all `google_calendar_*` columns.

### 6.7 Automated
- `pnpm -C apps/web test` (availability/overlap, hold expiry, mock payment confirm for
  bookings, GCal mock free/busy — add if missing).
- `pnpm run regtest` (build + lint + a11y) green before deploy.

# Scheduling — Deployment, Environments & Testing

Operational runbook for the native scheduling feature (calendar view, slot booking,
Google Calendar sync). Covers what to deploy, how `APP_URL` and secrets flow through
each layer, what to switch when moving between environments, and how to test.

Related: [00-overview.md](00-overview.md) · [google-calendar-integration.md](google-calendar-integration.md) · [stage-s2-schema.md](stage-s2-schema.md)

---

## 1. Where configuration actually lives

There are two independent layers with **different** config mechanics.

| Layer | How it gets its URL/secrets | Switch per environment? |
| --- | --- | --- |
| **Frontend SPA** (`apps/web`) | `window.location.origin` at runtime; Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` baked in at **build time** | **No** for URLs (origin is derived). Only rebuild if the Supabase project changes. |
| **Edge Functions** (`supabase/functions`) | `Deno.env.get(...)` from **Supabase's hosted secret store** (set via `supabase secrets set`) — **not** the repo `.env` at runtime | **Yes** — secrets are per Supabase project. |

**Consequence:** deployed Edge Functions never read your local `.env`. `.env` is only
used by (a) the Vite build for `VITE_*` vars and (b) local scripts that push secrets
(`pnpm secrets:google-calendar`). So `APP_URL` must be set as a Supabase secret for
the environment you're running against.

---

## 2. `APP_URL` — every consumer and the coupling that matters

`APP_URL` is the **public URL of the SPA** (front door in the browser), e.g.
`http://localhost:5173` (dev) or `https://app.opalswift.com` (prod).
It is **not** `VITE_SUPABASE_URL` (that is the backend API).

Edge Functions that read `APP_URL` for scheduling:

- `google-calendar-oauth-start` / `google-calendar-oauth-callback` —
  `redirect_uri` = `{APP_URL}/admin/setup/integrations/google/callback`
- `expire-scheduling-holds` — “book again” / reminder email links (`{APP_URL}/book`)
- `finalise-payment` / appointment + waiver emails — sign / pay links

The frontend does **not** use `APP_URL` — OAuth callback and enrol links use
`window.location.origin`.

### The one coupling to keep in sync

```
Supabase secret APP_URL  ──►  redirect_uri sent to Google  ──►  must match a
                                                                 Google Console
                                                                 Authorized redirect URI
```

Register both URIs on one OAuth client when possible:

```
http://localhost:5173/admin/setup/integrations/google/callback
https://app.opalswift.com/admin/setup/integrations/google/callback
```

Then the **only** thing that changes per environment is the Supabase `APP_URL` secret.

> Do not leave a production project's `APP_URL` pointed at localhost — it breaks
> emailed pay/waiver links and Google OAuth.

For local Testing-mode Google OAuth, `APP_URL=http://localhost:5173` is correct.
Flip to the production origin (and re-run `pnpm secrets:google-calendar`) when going live.

---

## 3. Secrets

| Secret | Purpose | Notes |
| --- | --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client id | Required for real connect |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth client secret **and** HMAC key for signed OAuth `state` | Required (mock has a fallback secret only when mock is on) |
| `GOOGLE_CALENDAR_MOCK` | `true` = stub free/busy + events | **Unset / not `true` in prod** |
| `APP_URL` | SPA public URL | See §2 |
| `CRON_SECRET` | Hold-expiry cron | exists |
| `WAIVER_LINK_SECRET` | Booking→pay and guest waiver tokens | exists |

Sync from `.env`:

```bash
pnpm secrets:google-calendar
```

Expects `.env` keys: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `APP_URL`
(not the legacy `GOOGLE_CLIENT_*` names).

---

## 4. Deploy

### Migrations

Apply through `04200` on remote:

| Range | Contents |
| --- | --- |
| `03100`–`03600` | Features, Google tokens, calendar/booking schema, cron |
| `03700` | `offering_type`, appointment RPCs, drop `is_bookable` |
| `03800`–`03900` | Scheduling table grants (authenticated + service_role) |
| `04000` | Google RPC `search_path` includes `extensions` (pgcrypto) |
| `04100` | `replace_tenant_scheduling_hours` (atomic hours save) |
| `04200` | `pending_waiver` occupies slots in availability / holds / admin calendar |

```bash
# Prefer project push when available; on Windows without Docker:
node scripts/apply-pending-migrations.mjs supabase/migrations/2026060800XXXX_….sql
```

### Edge Functions

Public / no user JWT:

```bash
supabase functions deploy prepare-booking-checkout --no-verify-jwt
supabase functions deploy get-available-slots --no-verify-jwt
supabase functions deploy expire-scheduling-holds --no-verify-jwt
```

Admin Google (JWT off at gateway; handlers use `requireAuthUser`):

```bash
supabase functions deploy google-calendar-oauth-start
supabase functions deploy google-calendar-oauth-callback
supabase functions deploy google-calendar-disconnect
supabase functions deploy google-calendar-freebusy
supabase functions deploy google-calendar-sync-event
```

**Shared `finalise-payment` / appointment emails / completion `appointment` field:**

```bash
supabase functions deploy handle-payment-event
supabase functions deploy record-payment
supabase functions deploy confirm-mock-payment --no-verify-jwt
supabase functions deploy prepare-enrolment-checkout --no-verify-jwt
supabase functions deploy get-enrolment-completion --no-verify-jwt
supabase functions deploy get-waiver-engagement --no-verify-jwt
```

Or batch: `pnpm deploy:scheduling-functions` + `pnpm deploy:payment-functions`.

`verify_jwt` for each function is pinned in `supabase/config.toml`.

---

## 5. Environment switch checklist (local ⇄ prod)

- [ ] `supabase secrets set APP_URL="<origin>"` (or `pnpm secrets:google-calendar`)
- [ ] Confirm `<origin>/admin/setup/integrations/google/callback` is in Google Console
- [ ] `GOOGLE_CALENDAR_MOCK` not `true` in prod
- [ ] Frontend: rebuild only if `VITE_SUPABASE_*` changed
- [ ] After localhost testing, restore production `APP_URL` if sharing one Supabase project

---

## 6. Testing plan

### 6.1 Feature flags
- Enable `scheduling:calendar.view`, `scheduling:booking.client`, `scheduling:booking.admin`,
  and optionally `scheduling:integration.google_calendar`.
- Nav: **Classes** and **Book** are top-level (no Browse accordion). Guests see Book when
  `enabled_features` includes client booking.

### 6.2 Calendar view
- `/classes` shows class timetable; appointment offerings are separate under `/book`.

### 6.3 Availability + holds
- Booking Settings: hours (atomic save), buffer, window, hold TTL.
- Services: `offering_type='appointment'`.
- Slots exclude holds, blocks, and `pending_payment` / `active` / `pending_waiver`.
- Concurrent holds on same slot → second fails.

### 6.4 Booking → payment
- `/book` → service/slot → details → hold stores email → prepare-checkout requires same email.
- Invalid `/book/:badId` → notice + first available service; URL cleaned.
- Mock pay → `active` or `pending_waiver`; appointment emails; optional GCal event.
- Payment success: **Add to Google Calendar** + download `.ics` when `appointment` is in context.
- Guest waiver: `/enrol/complete?engagementId=&wt=` via `get-waiver-engagement` (partial template OK).

### 6.5 Hold expiry
- Expired unpaid appointment → `cancelled` (`booking_hold_expired`); slot frees.
- Late provider webhook must **not** reactivate cancelled engagement (`payment_activation_skipped`).
- Group-class `pending_payment` (no `booked_starts_at`) untouched.

### 6.6 Google Calendar
- Connect from Booking Settings → signed state → callback → connected email.
- Free/busy fail-closed; sync on confirm for `active`/`pending_waiver`; admin manual sync;
  cancel deletes event.
- Disconnect clears credentials.

### 6.7 Automated
- `pnpm run regtest` green before deploy.

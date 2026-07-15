# Google Calendar integration (appointment booking)

**Status:** Implemented (S3b–S3d)

Part of [scheduling/00-overview.md](00-overview.md). Normative: [SPEC §2.2.1](../../SPEC.md).

**Cal.com is out of scope.** Google Calendar is the **external calendar sync** — not the booking UI or payment layer.

---

## What Google does vs what we build

| | Manage Studio (native) | Google Calendar API |
| --- | --- | --- |
| Public slot picker (`/book`) | ✅ | — |
| Holds, conflict rules, Jerusalem TZ | ✅ | — |
| Checkout + invoice | ✅ (existing finance) | — |
| Block slots when provider busy elsewhere | Uses | ✅ `freebusy.query` (fail-closed on error) |
| Show booking on **studio** calendar | Uses | ✅ `events.insert` / `delete` |
| Client “Add to my calendar” after pay | ✅ Google template URL + `.ics` (no OAuth) | — |
| Group class term enrolment | ✅ `/enrol` | Optional later |

We do **not** embed Google Appointment Schedule or use Google as the checkout host.

---

## OAuth model

**Per-tenant (V1):** `tenant_admin` connects one Google account; calendar defaults to `primary`.

**UI:** Booking Settings → Google Calendar connect (`/admin/setup/booking`).

**Callback route:** `/admin/setup/integrations/google/callback` (behind `AdminRoute`; login redirect preserves `pathname + search` so `code`/`state` survive re-auth).

**Storage:** refresh/access tokens encrypted via `pgp_sym_encrypt` (`save_tenant_google_credentials` / `get_tenant_google_credentials`, `search_path = public, extensions`). Columns on `tenants` (and/or credentials RPCs from `03600`/`04000`).

**Platform env (Edge Functions):**

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `APP_URL` — redirect URI = `{APP_URL}/admin/setup/integrations/google/callback`
- Optional: `GOOGLE_CALENDAR_MOCK=true` (dev stub; must be unset in prod)

Feature flag: `scheduling:integration.google_calendar` (required on **start and callback**).

### OAuth `state` (CSRF)

HMAC-signed payload (not forgeable base64 JSON alone):

```
state = base64url({ tid, uid, exp, n }).hmac
```

Signed with `GOOGLE_CALENDAR_CLIENT_SECRET` (mock fallback secret only when `GOOGLE_CALENDAR_MOCK=true`). Callback verifies signature, 15‑minute expiry, and that `tid`/`uid` match the authenticated admin. Helper: `_shared/google-oauth-state.ts`.

Frontend Strict Mode: single in-flight exchange per `code`; `sessionStorage` success marker written **only after** exchange succeeds.

---

## Availability algorithm

1. Admin defines **working hours** + slot duration + buffer (`tenant_scheduling_*`).
2. `get_available_slots` generates candidates in `Asia/Jerusalem`.
3. Subtract open holds, blocks, and engagements in `pending_payment` | `active` | `pending_waiver`.
4. If Google connected: Edge `get-available-slots` layers `freebusy.query` (fail-closed).
5. Client UI: FullCalendar + day slot buttons; “next available” search window.

Hours replace-all uses RPC `replace_tenant_scheduling_hours` (single transaction).

---

## Booking confirm / sync

```
Client selects slot → hold (TTL from settings; stores client_email)
  → prepare-booking-checkout (client_email must match hold)
  → /enrol/pay → payment success
  → finalise-payment:
       refuse activation if cancelled/withdrawn or slot taken
       else → active | pending_waiver
       appointment emails (client + tenant_admin)
       syncBookingEventInsert (google_event_id)
  → issue-document (existing)
```

**Admin:** Appointments page — “Add to Google Calendar” when connected and status is `active`/`pending_waiver` without `google_event_id`; badge when synced. Cancel deletes the Google event (best-effort).

**Client payment success:** personal calendar link + `.ics` from checkout context `appointment` field (`prepare-enrolment-checkout` / `get-enrolment-completion`) — no tenant OAuth.

---

## Edge functions

| Function | Role |
| --- | --- |
| `google-calendar-oauth-start` | Auth URL + signed `state`; requires feature + `APP_URL` |
| `google-calendar-oauth-callback` | Exchange code, verify state, encrypt tokens |
| `google-calendar-disconnect` | Clear credentials |
| `google-calendar-freebusy` | Internal free/busy helper |
| `google-calendar-sync-event` | Insert/delete for admin or lifecycle |
| `get-available-slots` | Public slots + optional Google filter |
| `prepare-booking-checkout` | Hold → engagement + pay token |

Tokens never leave the server except via OAuth redirect handoff.

---

## Schema (see also stage-s2)

- `engagements.booked_starts_at` / `booked_ends_at` / `google_event_id` / `scheduling_hold_id`
- `scheduling_holds`, `tenant_scheduling_settings`, `tenant_scheduling_hours`
- `offerings.offering_type = 'appointment'`

Migrations: `03200`–`03600` (GCal + booking), `03700`–`04200` (offering_type, grants, pgcrypto path, hours RPC, pending_waiver occupancy).

---

## Testing

- Google Cloud: Calendar API + OAuth consent (Testing mode + test users).
- Register redirect URIs for each `APP_URL` origin.
- `GOOGLE_CALENDAR_MOCK=true` for local stub paths.
- Sync secrets: `pnpm secrets:google-calendar` (reads `.env` `GOOGLE_CALENDAR_*` + `APP_URL`).

---

## Security checklist

- Signed OAuth `state` (tenant + admin user + expiry)
- Encrypted refresh/access tokens; service-role RPCs only
- Feature gate on oauth start **and** callback
- Minimal scopes: `calendar.events`, `calendar.readonly`, `userinfo.email`
- Hold checkout bound to hold `client_email`
- Free/busy fail-closed
- Disconnect revokes DB credentials

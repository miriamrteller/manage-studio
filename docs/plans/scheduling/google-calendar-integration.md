# Google Calendar integration (appointment booking)

**Status:** Spec only · **Not implemented**

Part of [scheduling/00-overview.md](00-overview.md). Normative: [SPEC §2.2.1](../../SPEC.md).

**Cal.com is out of scope.** Google Calendar replaces it as the **external calendar sync** — not as the booking UI or payment layer.

---

## What Google does vs what we build

| | Manage Studio (native) | Google Calendar API |
| --- | --- | --- |
| Public slot picker | ✅ | — |
| Holds, conflict rules, Jerusalem TZ | ✅ | — |
| Checkout + invoice | ✅ (existing finance) | — |
| Block slots when provider busy elsewhere | Uses | ✅ `freebusy.query` |
| Show booking on provider's phone/desktop calendar | Uses | ✅ `events.insert` / `patch` / `delete` |
| Group class term enrolment | ✅ `/enrol` | Optional later |

We do **not** embed Google Appointment Schedule or use Google as the checkout host.

---

## OAuth model

**Per-tenant (V1):** `tenant_admin` connects one Google account + chosen `calendar_id` (primary or dedicated “Bookings” calendar).

**Future (V2.11+ staff):** per-`staff_id` token when teachers module links auth users.

**Storage:** refresh token encrypted at rest (same pattern as payment credentials — `pgp_sym_encrypt` + `get_app_encryption_key()`). Store: `google_calendar_refresh_token_enc`, `google_calendar_id`, `google_calendar_connected_at`, `google_calendar_email` on `tenants` or `staff` row.

**Platform env (Edge Functions):**

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- Redirect URI: `{APP_URL}/admin/setup/integrations/google/callback`

Feature flag: `scheduling:integration.google_calendar`

---

## Availability algorithm (high level)

1. Admin defines **working hours** + slot duration + buffer (Postgres — stage S2).
2. Generate candidate slots in tenant timezone (`Asia/Jerusalem` default).
3. If Google connected: call `freebusy.query` for range → remove overlapping candidates.
4. Apply local holds (in-flight bookings) from DB.
5. Present remaining slots in client UI.

---

## Booking confirm flow

```
Client selects slot → hold row (TTL 10–15 min)
  → waiver? → create-checkout → payment success
  → finalise-payment creates/updates engagement
  → edge: google-calendar-sync
       events.insert(summary, start, end, description, location)
       store google_event_id on booking/engagement row
  → issue-document (existing)
```

**Cancel / reschedule:** update engagement status → `events.delete` or `events.patch`; release hold.

---

## Edge functions (planned)

| Function | Role |
| --- | --- |
| `google-calendar-oauth-start` | Return Google auth URL (state = tenant_id + nonce) |
| `google-calendar-oauth-callback` | Exchange code, encrypt refresh token, save calendar id |
| `google-calendar-freebusy` | Internal/service — called from slot availability RPC |
| `google-calendar-sync-event` | Insert/update/delete event on booking lifecycle |

Use service role + tenant scoping; never expose refresh token to client.

---

## Schema additions (stage S2 — draft)

- `appointment_bookings` or extend `engagements` with `booked_starts_at`, `booked_ends_at`, `google_event_id`
- `scheduling_holds` — short-lived slot reservations
- `tenant_scheduling_settings` — work hours, slot length, buffer minutes

Detail in `stage-s2-schema.md` (to write when S2 starts).

---

## Implementation order

| Stage | Scope |
| --- | --- |
| S2 | Booking schema + holds |
| S3 | Client book UI + checkout |
| **S3b** | Google OAuth settings UI + token storage |
| **S3c** | freebusy in availability RPC |
| **S3d** | Event push on confirm/cancel |
| S4 | Admin availability UI |

S3b–S3d can ship after core book+pay works without Google (manual availability only).

---

## Testing

- Google Cloud project with Calendar API enabled; OAuth consent screen (testing mode + test users).
- Mock freebusy/events in unit tests; optional `GOOGLE_CALENDAR_MOCK=true` for dev (mirror `GROW_MOCK` pattern).

---

## Security

- Minimal scopes: `https://www.googleapis.com/auth/calendar.events` + `calendar.readonly` (or `calendar.events` only if freebusy covered).
- Revoke on disconnect; delete tokens from DB.
- RLS: only `tenant_admin` reads integration status; tokens never to browser except OAuth redirect handoff.

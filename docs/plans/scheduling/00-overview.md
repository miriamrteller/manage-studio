# Scheduling — overview (calendar + native slot booking + Google Calendar)

**Status:** Implemented (S0–S4 core) · Penalties / no-show (S5) still open

Normative: [SPEC.md §2.2.1](../../SPEC.md), [SPEC §8 V2.12](../../SPEC.md).

**Cal.com is out of scope.** **Google Calendar** is the external integration for appointment availability sync and event push.

---

## Three layers

| Layer | Flag | Stack |
| --- | --- | --- |
| **Calendar view** | `scheduling:calendar.view` | FullCalendar — read-only timetable (`/classes`) |
| **Slot booking** | `scheduling:booking.client`, `scheduling:booking.admin` | Custom UI + Postgres + finance edge functions |
| **Google Calendar** | `scheduling:integration.google_calendar` | OAuth + Calendar API (free/busy + events) |

FullCalendar and Google **do not** replace checkout — they are display and sync respectively.

---

## Flows

### Group class (Professional)

```
/classes → detail → /enrol (existing wizard)
```

### Bookable appointment

```
/book[/:offeringId]
  → pick service + slot (FullCalendar + slot buttons; Google free/busy if connected)
  → client details → create_scheduling_hold (stores client_email)
  → prepare-booking-checkout (email must match hold)
  → /enrol/pay/:id?t=… → payment
  → finalise-payment:
       pending_payment → active | pending_waiver
       appointment confirmation emails (client + tenant admins)
       google-calendar-sync (events.insert) when active/pending_waiver
  → payment success: client “Add to Google Calendar” / .ics (no OAuth)
  → if pending_waiver: /enrol/complete?engagementId=…&wt=… (guest WaiverToken)
```

Booking works **without** Google (manual hours only). Google adds busy blocking + studio calendar mirroring.

Invalid `/book/:offeringId` deep links fall back to the first bookable service and show a notice.

---

## Offering types

| `offerings.offering_type` | UI | Availability |
| --- | --- | --- |
| `class` | Classes calendar / enrol | Weekly `day_of_week` + sessions |
| `appointment` | `/book`, Services admin, Appointments | `tenant_scheduling_hours` + holds + Google free/busy |

`is_bookable` was dropped; `offering_type = 'appointment'` is canonical (`03700`).

Slot occupancy includes engagements in `pending_payment`, `active`, and **`pending_waiver`** (`04200`).

---

## Payment / invoice / email

Same V1 spine: Grow / iCount / Mock → checkout → `finalise-payment` → `issue-document`.

Appointment-specific after pay:

- Client + tenant-admin confirmation emails (`sendAppointmentConfirmationEmails`)
- Idempotency: `payment_confirmation_email_sent` (client), `appointment_tenant_notification_email_sent` (tenant)
- Late payment after hold expiry does **not** reactivate a cancelled engagement (`payment_activation_skipped` audit)

---

## Implementation stages

| Stage | Scope | Status |
| --- | --- | --- |
| S0 | Feature flags | ✅ |
| S1 | FullCalendar timetable | ✅ |
| S2 | Booking schema + holds + cron | ✅ |
| S3 | Client book UI + checkout + deep-link validation | ✅ |
| S3b–S3d | Google OAuth, freebusy, event sync | ✅ |
| S4 | Admin availability / services / appointments | ✅ |
| S5 | Penalties / no-show | Open |

---

## Related

- [google-calendar-integration.md](google-calendar-integration.md)
- [deployment-and-testing.md](deployment-and-testing.md) — deploy commands, `APP_URL`/secrets, testing plan
- [stage-s2-schema.md](stage-s2-schema.md)
- `packages/shared/src/config/feature-registry.ts`
- Migrations: `03100`–`04200`

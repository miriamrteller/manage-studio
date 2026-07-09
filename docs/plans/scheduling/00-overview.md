# Scheduling — overview (calendar + native slot booking + Google Calendar)

**Status:** Spec locked · **Not implemented**

Normative: [SPEC.md §2.2.1](../../SPEC.md), [SPEC §8 V2.12](../../SPEC.md).

**Cal.com is out of scope.** **Google Calendar** is the external integration for appointment availability sync and event push.

---

## Three layers

| Layer | Flag | Stack |
| --- | --- | --- |
| **Calendar view** | `scheduling:calendar.view` | FullCalendar — read-only timetable |
| **Slot booking** | `scheduling:booking.client`, `scheduling:booking.admin` | Custom UI + Postgres + finance edge functions |
| **Google Calendar** | `scheduling:integration.google_calendar` | OAuth + Calendar API (free/busy + events) |

FullCalendar and Google **do not** replace checkout — they are display and sync respectively.

---

## Flows

### Group class (Professional)

```
Calendar/list → detail → /enrol (existing wizard)
```

### Bookable appointment (Essential / override)

```
/book → slot picker (native; slots filtered by Google free/busy if connected)
  → waiver? → create-checkout → issue-document
  → google-calendar-sync (events.insert)
```

Booking works **without** Google (manual hours only); Google adds real-world busy blocking + calendar mirroring.

---

## Payment / invoice

Same V1 spine: Grow / iCount / Rapyd–Yesh → `create-checkout` → `finalise-payment` → `issue-document`.

---

## Implementation stages

| Stage | Scope |
| --- | --- |
| S0 | Feature flags `02800`, `02900` ✅ |
| S1 | FullCalendar timetable |
| S2 | Booking schema + holds |
| S3 | Client book UI + checkout |
| S3b–S3d | Google OAuth, freebusy, event sync — [google-calendar-integration.md](google-calendar-integration.md) |
| S4 | Admin availability UI |
| S5 | Penalties / no-show |

---

## Related

- [google-calendar-integration.md](google-calendar-integration.md)
- [deployment-and-testing.md](deployment-and-testing.md) — deploy commands, `APP_URL`/secrets per environment, testing plan
- [stage-s2-schema.md](stage-s2-schema.md)
- `packages/shared/src/config/feature-registry.ts`
- Migrations: `03100`–`03600`

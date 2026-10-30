# Photographer beta — Thread A: shoots, menus, contracts (2026-10-30)

Beta deadline Sunday 2026-11-01. Three parallel threads; this is Thread A.
Thread B owns `20261030000200` (shoot payment requests + gallery gating),
Thread C owns `20261030000300` (quotes).

## Shared data contract (do not rename)

- A **job** ("Shoot / צילום" for photographers) = an `engagements` row
  (client person/account, `offering_id` = package, `booked_starts_at/ends_at`,
  `waiver_evidence_id` = signed contract, `payments.engagement_id`) plus a 1:1
  `job_details` row — migration `supabase/migrations/20261030000100_job_details.sql`.
- `job_details`: `engagement_id` PK → engagements (cascade), `tenant_id`,
  `job_status` (`enquiry|booked|shot|editing|delivered|cancelled`), `location`,
  `notes`, `lead_id` → leads, `gallery_url`, `gallery_released_at`, timestamps.
  RLS: admin full access via `get_my_tenant_id()`; client read of own rows via
  `get_my_person_id()` / account membership.
- RPCs (SECURITY DEFINER, tenant-admin only): `convert_lead_to_job(...)`,
  `create_job(...)`. Internal helpers `job_resolve_client`, `job_insert` are
  revoked from app roles.
- Engagement conventions for jobs: `season_id` NULL; `engagements.status`
  `'active'` for every live job (the enrolment payment-dunning cron chases
  `pending_payment`, so that status is never used), `'cancelled'` when
  cancelled. An undated job is limited to one open enquiry per client+package
  by `idx_engagements_active_no_season` — acceptable for beta.
- Packages are offerings with `offering_type='appointment'`, `duration_mins`
  set, no weekly slot, `season_id` NULL. A hidden "Custom shoot" package
  (`is_public=false`, price 0) exists so bespoke quotes still have an
  `offering_id`.
- Client = account (couple/family); primary contact = `accounts.person_id`;
  `engagements.person_id` = that primary contact.
- Payments slot: `apps/web/src/features/jobs/components/JobPaymentsPanel.tsx`
  (`<JobPaymentsPanel engagementId />`), a stub Thread B replaces in place.

## Delivered in this thread

1. Photographer skin: `resolveEntityLabels(preset, overrides, locale, vertical)`
   layers Client/לקוח, Shoot/צילום, Package/חבילה over the preset; `vertical`
   (= `tenants.skin`) now travels on `TenantConfig` and `useEntityLabels()`.
   Nav items carry `verticals` / `hideForVerticals`; photographers lose
   `/classes`, levels, terms and manage-classes and gain `/admin/jobs`.
   Dance/generic tenants are unchanged (tests in `navigation-config.test.ts`,
   `tenant-presets.test.ts`).
2. Migration + hand-edited `database.types.ts` (no local Supabase CLI here;
   verified by replaying the whole chain on a local Postgres 16).
3. Admin Shoots list (`/admin/jobs`) and detail (`/admin/jobs/:id`):
   client, package, date/time, location, status pipeline, notes, gallery link,
   contract status, payments slot. Create shoot from admin (existing client via
   `PersonSearchCombobox`, or new client), package, optional date.
4. Lead → shoot: "Convert to shoot" on `/admin/leads` (photographer tenants)
   → `convert_lead_to_job` → navigates to the new shoot.
5. Contract: the tenant's active consent template is the contract.
   `send-job-contract-link` emails a WaiverToken link to `/enrol/complete`;
   `get-waiver-engagement` and `accept-waiver` render merge fields
   (`{{client_name}} {{shoot_date}} {{location}} {{package}} {{price}}`)
   identically on both sides, so `wording_snapshot` / hash cover the rendered
   text. Signed status = `engagements.waiver_evidence_id` set.
6. `supabase/seed-photographer.sql`: appointment packages, hidden custom
   package, contract template, two demo clients and two demo shoots
   (idempotent; verified twice on the local chain).

## Follow-ups (post-beta)

- Dedicated contract email template (currently reuses the waiver-reminder
  email with the package as "class").
- Jobs for beauticians: nav/labels are keyed per vertical; add a
  `beautician` vocabulary when that skin ships.

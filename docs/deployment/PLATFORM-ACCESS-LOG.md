# Platform access log

Studios can see when the OpalSwift platform owner (the single `super_admin`
account, reserved by `20260827000100_super_admin_lockdown.sql`) opens or
changes their data: **Settings → Security → OpalSwift access**.

Migration: `supabase/migrations/20261101140810_platform_access_log.sql`.
Tests: `supabase/tests/platform-access-log/run.sh` (db-ci `local-stack`).

## What is recorded

| kind     | when                                                                                         | area                         |
|----------|----------------------------------------------------------------------------------------------|------------------------------|
| `change` | a signed-in super_admin inserts, updates or deletes a row of a watched table (trigger)        | the table name               |
| `view`   | the web app opens a page of the studio for a super_admin (`log_platform_view`, route guards) | the page, e.g. `admin-students` |

- Only access to a studio **other than the super_admin's own profile studio**
  is logged. Service-role, cron and Edge Function writes (no signed-in user)
  are never logged.
- Views: at most one row per actor + studio + page per 10 minutes (the app and
  the database both dedupe).
- No personal data values: `record_id` is the row's id, and for updates
  `detail` lists only the names of the changed columns (`update: name, email`).
- Watched tables: tenants, tenant_feature_overrides, user_profiles, staff,
  people, accounts, account_members, leads, engagements, attendance, payments,
  billing_accounts, waiver_events, waiver_evidence, consent_records. To watch
  another table, add it to the list in a new migration (one generic trigger
  function, `log_platform_change()`).

## Who can read it

- A studio's `tenant_admin`s: their own studio's rows (RLS).
- super_admin: all rows.
- Nobody else; anon has no access.

## Append-only and retention

- No UPDATE or TRUNCATE for any role (super_admin, service_role and the
  database owner included): a trigger refuses them.
- DELETE is refused for rows younger than **24 months**; older rows may be
  purged. Retention is 2 years.
- `tenant_id` has no foreign key, so a log outlives a deleted studio and
  never blocks the deletion.
- Postgres superusers can still disable triggers; that is outside what the
  app can enforce and is covered by the hosting provider's access controls.

The DPA wording is maintained separately (docs/legal).

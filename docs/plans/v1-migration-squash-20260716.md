# Fourth migration squash + payment-provider schema merge (agent-ready)

**Status:** Ready to verify on branch `chore/migration-fourth-squash` — reset via SQL Editor → `pnpm db:push` → seed → types  
**Date:** 2026-07-16  
**Repo:** `manage-studio`  
**Precondition:** Dev DB will be **fully reset**. No production migration history to preserve.  
**Out of scope for this PR:** Adapter factory rewrite, Edge retargeting, settings UI. Schema must be ready so those can land **without further ALTER churn**.

---

## Mission

Produce one authoritative, linearly ordered migration chain that:

1. Bakes **final** table shapes into each `CREATE TABLE` (no evolutionary `ALTER` / drop-column steps).
2. Folds scheduling + feature flags + Google Calendar into the base chain.
3. Merges Rapyd / Yesh / Tranzila **onto `tenants` + `payments`** (manage-studio SSOT) — **never** create `tenant_configs` / `tenant_settings` / `tenant_credentials` / parallel `bookings` / parallel `invoices`.
4. Applies cleanly on a wiped Supabase project (`reset` → `db:push`) with **zero** dependency / undefined-object errors.
5. Updates `reset_dev_db.sql`, seeds, SPEC §4.2.0, regenerates types.

**No git commit/push** unless the user explicitly asks.

---

## Locked product decisions (do not reopen)

| Topic | Decision |
| --- | --- |
| Secrets | `pgp_sym_encrypt` + SECURITY DEFINER credential RPCs (same as Grow/iCount). **No** vault `secret_key_ref` dual system. |
| Tranzila “bookings” | Map to `scheduling_holds` + `engagements` + `payments`. **Do not** create `bookings`. |
| Yesh invoices | Columns on `payments` + existing `document_queue`. **Do not** create `invoices` / `tenant_invoices` SSOT. |
| Provider columns | Bake Rapyd / Yesh / Tranzila config onto **`tenants`** in `00200`. |
| Tranzila payment refs | TEXT columns on **`payments`** — **no FK** to a bookings table. |
| `b2b_flag` | On **`payments`** (not on a bookings table). |
| Dual OpalSwift edges | Leave code alone this PR; schema must not block a later unify. |

---

## Hard rules (reliability / safety / security / correctness)

### Apply-safety (Supabase / Postgres)

1. **Filename order = apply order.** Never reference a table, type, function, or enum before it is created.
2. **Bake, don’t evolve.** No `ADD COLUMN` then `DROP COLUMN` (`is_bookable`). No intermediate RPC bodies that reference dropped columns.
3. **One final body per function** in the chain (last definition wins; prefer a single definition in the owning file).
4. **No `CREATE INDEX CONCURRENTLY`** (breaks transactional migrations).
5. **Circular FKs:** people↔accounts keep deferred `ALTER` in `00300`. `engagements.scheduling_hold_id`: column in `01300`, **FK added in scheduling file** after `scheduling_holds` exists.
6. **`tenants.skin → verticals(id)`:** create `tenant_plan` enum + `verticals` **before** `CREATE TABLE tenants` inside `00200`; seed verticals before any INSERT that sets `skin`.
7. **Grants last** among tables: expand former `02500` to cover features + scheduling; place **after** those CREATEs. `GRANT ALL ON ALL TABLES` does **not** apply to tables created later — either grants file is truly last or re-grant explicitly.
8. **Crypto RPCs:** `SET search_path = public, extensions` (pgcrypto).
9. **SECURITY DEFINER** RPCs: pinned `search_path`; never expose `*_enc` BYTEA to `anon`/`authenticated` SELECT; use boolean “configured” flags in public RPCs.
10. **RLS:** enable on every new app table; policies use `get_my_tenant_id()` / `is_super_admin()` / `is_service_role()` — **never** `tenant_id = auth.uid()`.
11. **Extensions:** `pgcrypto` in `00200`; `pg_cron` + `pg_net` only in jobs migration.
12. **Idempotent seeds in migrations:** `ON CONFLICT DO NOTHING` for platform seed rows (verticals, features).
13. **Auth:** `user_profiles.id` → `auth.users`; trigger on `auth.users` only after profiles table exists.
14. **Storage:** bucket inserts only after Storage schema exists (Supabase default OK).

### Security

- Secrets only in BYTEA `*_enc` columns; decrypt only in service_role / SECURITY DEFINER RPCs.
- Rapyd `access_key` may live in JSONB (non-secret); secret stays encrypted.
- Public RPCs: filter by `p_subdomain`; no encrypted column leakage.
- `REVOKE` sensitive EXECUTE from `PUBLIC` / `authenticated` where pattern already exists (`sign_waiver`, encryption helpers).

### Maintainability

- Keep one concern per migration file (existing style).
- Header comments: purpose + DEPENDENCIES.
- Archive superseded SQL under `migrations_backup/`; never leave broken Jul files in `migrations/`.
- Update SPEC §4.2.0 index to match filenames exactly.

### Correctness

- Final RPC supersession table (below) is authoritative — do not paste earlier bodies.
- Seed SQL must match final CREATEs (`offering_type`, `plan`/`skin`, scheduling tables).
- After push: `pnpm db:types` must succeed against linked/local DB.

---

## Pre-flight (agent MUST read fully)

1. This document end-to-end.
2. `SPEC.md` §4.2.0 + squash notes (2026-06-08, 06-24, 07-05).
3. `docs/plans/v1-migration-squash-20260705.md` (pattern reference).
4. Current `supabase/migrations/20260608000200` … `04200` + Jul `202607*` files.
5. `supabase/reset_dev_db.sql`, `supabase/seed.sql`, `supabase/seed-finance.sql`.
6. Payment merge decisions in chat (pgp, no bookings table, payments columns for Yesh/Tranzila).

---

## End-state file chain (authoritative)

Rename/re-timestamp only if needed for clarity; **order matters more than numbers**. Target:

| Seq | Filename (suggested) | Owns |
| --- | --- | --- |
| 1 | `20260608000200_core_tenants.sql` | pgcrypto, private.platform_config, **tenant_plan enum**, **verticals** (+ seed), **tenants (FINAL cols)**, user_profiles, RLS helpers |
| 2 | `20260608000300_people.sql` | people ↔ accounts |
| 3 | `20260608000400_contact_prefs.sql` | |
| 4 | `20260608000500_offerings.sql` | seasons/categories/staff/**offerings FINAL** |
| 5–12 | `00600`–`01200` | unchanged structure (comms…waiver) |
| 13 | `20260608001300_engagements.sql` | engagements FINAL cols (incl. booked_* / google_event_id / scheduling_hold_id **column, no FK yet**) |
| 14–15 | attendance, engagement_rls | |
| 16 | `20260608001600_finance.sql` | payments FINAL (+ Yesh/Tranzila/b2b cols), finance tables, Grow/iCount + **Rapyd/Yesh/Tranzila credential RPCs** |
| 17–23 | storage … engagement_actions | public RPCs: **final** `get_public_offerings` / leave stub replaced later if needed |
| 24 | `20260608002400_tenant_provisioning.sql` | `check_subdomain_available` only **or** stub; **final `provision_tenant` lives with features** |
| 25 | `20260608002500_feature_flag_system.sql` | feature_definitions, overrides, seeds (030+031+032), `get_tenant_features`, **final `provision_tenant`**, **final `get_tenant_config_by_subdomain`** |
| 26 | `20260608002600_scheduling.sql` | scheduling_blocks, settings, hours, holds; FK engagements→holds; **final** slot/hold/schedule RPCs (04200) + bookable/public schedule (03700) + `release_scheduling_hold` (03400) + `replace_tenant_scheduling_hours` (04100) + Google credential RPCs (04000 + disconnect/connection from 03600) |
| 27 | `20260608002700_grants.sql` | **ALL** table grants (V1 + features + scheduling) — true last for tables |
| 28 | `20260608002800_scheduled_jobs.sql` | fold current `02600` + `02700` cron platform config + `03500` expire-holds cron |

**Delete from `migrations/` after archive:**

- `20260608002600_scheduled_jobs.sql` (content folded → 02800)
- `20260608002700_cron_platform_config.sql` (→ 02800)
- `20260608003000` … `20260608004200` (all)
- `20260709000100`, `20260709000150`, `20260709000200`, `20260710000100`, `20260712000100`

**Archive to:** `supabase/migrations_backup/incremental_20260716/` + `README.md`:

```text
Fourth squash (2026-07-16). Folded into 20260608* base chain.
OpalSwift Jul payment files archived — rewritten onto tenants/payments; do not re-apply.
```

If keeping existing timestamps instead of renumbering: still fold content the same way, but ensure **grants run after scheduling** and **jobs last**. Prefer the renumbered chain above to avoid “02500 grants before features” confusion.

---

## Step-by-step fold map

### Step A — Archive

```bash
mkdir -p supabase/migrations_backup/incremental_20260716
# copy then delete (see file list above)
```

### Step B — `00200_core_tenants.sql` (bake FINAL tenants)

**Before `CREATE TABLE tenants`:**

1. `CREATE TYPE tenant_plan AS ENUM ('essential', 'professional');`
2. `CREATE TABLE verticals (...)` (from 03000) + RLS optional later or here.
3. `INSERT` four verticals (`photographer`, `beautician`, `dance-studio`, `generic`) `ON CONFLICT DO NOTHING`.

**`CREATE TABLE tenants` columns to ADD (in addition to existing):**

```text
plan, skin (FK verticals), sub_status, trial_ends_at, onboarding_status
google_calendar_refresh_token_enc, google_calendar_access_token_enc,
google_calendar_token_expires_at, google_calendar_id, google_calendar_email,
google_calendar_connected_at
rapyd_config JSONB
yesh_config JSONB
tranzila_terminal_name TEXT
  CHECK (tranzila_terminal_name IS NULL OR tranzila_terminal_name ~ '^[a-z][a-z0-9]{2,15}$')
payment_provider_sandbox BOOLEAN NOT NULL DEFAULT true
```

**Indexes:**

```sql
CREATE INDEX idx_tenants_rapyd_access_key
  ON tenants ((rapyd_config->>'access_key'))
  WHERE rapyd_config->>'access_key' IS NOT NULL;
```

**Comments:** document JSON shapes for rapyd_config / yesh_config (non-secret fields only; secrets in BYTEA).

**Do NOT** add vault-ref-only RPCs from Jul file. Credential RPCs go in finance (01600).

### Step C — `00500_offerings.sql` (FINAL offerings)

Replace NOT NULL on `start_time`/`end_time` with nullable.

Add:

```sql
offering_type TEXT NOT NULL DEFAULT 'class'
  CHECK (offering_type IN ('class', 'appointment')),
duration_mins INT CHECK (duration_mins IS NULL OR duration_mins > 0),
CONSTRAINT offerings_type_shape CHECK (
  (offering_type = 'class' AND start_time IS NOT NULL AND end_time IS NOT NULL)
  OR
  (offering_type = 'appointment'
     AND duration_mins IS NOT NULL
     AND day_of_week IS NULL AND start_time IS NULL AND end_time IS NULL)
),
```

Index `idx_offerings_type`. **Never** create `is_bookable`.

### Step D — `01300_engagements.sql`

Add before `created_at`:

```sql
booked_starts_at   TIMESTAMPTZ,
booked_ends_at     TIMESTAMPTZ,
google_event_id    TEXT,
scheduling_hold_id UUID,  -- FK added in scheduling migration
CONSTRAINT engagements_booked_pair CHECK (
  (booked_starts_at IS NULL AND booked_ends_at IS NULL)
  OR (booked_starts_at IS NOT NULL AND booked_ends_at IS NOT NULL
      AND booked_ends_at > booked_starts_at)
),
```

Update unique index `idx_engagements_active_no_season` to also require `booked_starts_at IS NULL` (from 03400).

### Step E — `01600_finance.sql` (payments + provider RPCs)

Add to `CREATE TABLE payments`:

```sql
b2b_flag BOOLEAN NOT NULL DEFAULT false,
allocation_number TEXT,
allocation_status TEXT,
allocation_skip_reason TEXT,
tranzila_reference_txn_id TEXT,
tranzila_auth_number TEXT,
tranzila_pr_id TEXT,  -- opaque provider ref; NO FK
```

Add SECURITY DEFINER RPCs (mirror Grow auth pattern — tenant_admin save, service_role get):

- `save_tenant_rapyd_credentials` / `get_tenant_rapyd_credentials` / `set_tenant_rapyd_customer_id`
- `save_tenant_yesh_credentials` / `get_tenant_yesh_credentials`
- `save_tenant_tranzila_credentials` / `get_tenant_tranzila_credentials` (terminal name + encrypt secret into `payment_provider_secret_enc` or dedicated BYTEA if cleaner — prefer dedicated `tranzila_secret_enc BYTEA` on tenants if mixing providers; **simplest secure approach:** store Tranzila app/secret in `payment_provider_secret_enc` / `payment_provider_webhook_enc` when `payment_provider = 'tranzila'`, and terminal on `tranzila_terminal_name`)

**Agent rule:** follow existing `save_tenant_grow_credentials` structure exactly (auth checks, encryption key, revoke other-provider tokens if that pattern applies).

### Step F — `01800_public_rpcs.sql`

Replace `get_public_offerings_by_subdomain` with **03700 final body** (filters `offering_type = 'class'`).

Replace or DROP `get_tenant_config_by_subdomain` here if it will be recreated in features file — **prefer:** remove from 01800 and define only in features file (02500) to avoid drift. If 01800 must keep a stub for early applies mid-chain, use DROP + create in 02500 (02500 supersedes).

### Step G — `02400_tenant_provisioning.sql`

Keep `check_subdomain_available`.  
**Remove** any stale `provision_tenant` if present (03000 owns final). Comment that provision lives in feature migration.

### Step H — New `02500_feature_flag_system.sql`

Assemble from current 03000 + 03100 + 03200:

1. `feature_definitions`, `tenant_feature_overrides` + RLS
2. Seed all features including native scheduling + Google Calendar flags (031/032)
3. `get_tenant_features` (+ helpers from 03000)
4. Final `provision_tenant` (from 03000)
5. Final `get_tenant_config_by_subdomain` (from 03000)
6. GRANTs for EXECUTE on those RPCs (inline, as today)

**Order inside file:** tables → seeds → functions that read features → provision/config.

### Step I — New `02600_scheduling.sql`

Assemble in this **internal** order:

1. `CREATE TABLE scheduling_blocks` (from 03300) + RLS
2. `tenant_scheduling_settings`, `tenant_scheduling_hours`, `scheduling_holds` (03400) + RLS
3. `ALTER TABLE engagements ADD CONSTRAINT … FOREIGN KEY (scheduling_hold_id) REFERENCES scheduling_holds(id);`
4. RPCs — **final bodies only:**
   - From 03700: `get_public_schedule_events_by_subdomain`, `get_bookable_offerings_by_subdomain`
   - From 04200: `get_available_slots`, `create_scheduling_hold`, `get_schedule_events`
   - From 03400: `release_scheduling_hold` (if not superseded)
   - From 04100: `replace_tenant_scheduling_hours`
   - From 03300: any schedule helpers still needed and not superseded
5. Google: 04000 credential trio + 03600 `disconnect_tenant_google_calendar` + `get_google_calendar_connection`
6. Inline EXECUTE grants for those RPCs (match existing patterns)

**Do not** include intermediate `is_bookable` logic.

### Step J — New `02700_grants.sql`

Start from current 02500; **add**:

Authenticated SELECT (+ appropriate write grants matching RLS admin patterns):

- `verticals`, `feature_definitions`, `tenant_feature_overrides`
- `tenant_scheduling_settings`, `tenant_scheduling_hours`, `scheduling_blocks`, `scheduling_holds`

Keep:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

Because this file runs **after** all tables, the blanket grant covers everything — still also list scheduling tables explicitly for authenticated (blanket does not grant to authenticated).

### Step K — New `02800_scheduled_jobs.sql`

Concatenate/adapt:

1. Current `02600_scheduled_jobs.sql` (extensions + jobs)
2. Current `02700_cron_platform_config.sql` (platform_config keys + reschedule)
3. Current `03500_scheduling_cron.sql` (expire-scheduling-holds)

Ensure job SQL is idempotent (`cron.unschedule` / schedule patterns already used).

### Step L — Companion files

**`reset_dev_db.sql`:** drop feature tables, scheduling tables, Google/provider functions, enum `tenant_plan`, any Jul stray objects (`bookings`, `invoices`, …) with `IF EXISTS`. Extend dynamic function drop list with all new RPC names.

**`seed.sql`:** ensure inserts use `offering_type`, `plan`/`skin`, optional scheduling settings rows. No `is_bookable`.

**`seed-finance.sql`:** header run order; no dependency on Jul tables.

**SPEC.md §4.2.0:** add **2026-07-16 — fourth squash** note; replace index table with new chain; document payment columns on tenants/payments.

**`docs/plans/README.md`:** mark this plan In Progress → Shipped when done.

---

## Final RPC supersession table (authoritative)

| Function | Source file for body |
| --- | --- |
| `get_available_slots` | 04200 |
| `create_scheduling_hold` | 04200 |
| `get_schedule_events` | 04200 |
| `get_public_offerings_by_subdomain` | 03700 |
| `get_public_schedule_events_by_subdomain` | 03700 |
| `get_bookable_offerings_by_subdomain` | 03700 |
| `get_tenant_config_by_subdomain` | 03000 |
| `provision_tenant` | 03000 |
| `get_tenant_google_credentials` | 04000 |
| `save_tenant_google_credentials` | 04000 |
| `update_tenant_google_access_token` | 04000 |
| `replace_tenant_scheduling_hours` | 04100 |
| `release_scheduling_hold` | 03400 (unless later file exists — prefer latest) |
| `disconnect_tenant_google_calendar` | 03600 |
| `get_google_calendar_connection` | 03600 |

---

## Tables explicitly forbidden in this squash

Do **not** CREATE:

`tenant_configs`, `tenant_settings`, `tenant_credentials`, `bookings`, `invoices`, `tenant_invoices`, `webhook_events`, `invoice_retry_queue`, `client_payment_tokens`, `tranzila_tokens`, `payment_callbacks_log`

Optional future (defer): generic `provider_webhook_events` — **omit** unless an Edge smoke hard-requires it; prefer post-squash additive migration only if needed.

---

## Verification (agent MUST run)

After user wipes remote with `reset_dev_db.sql` (or local):

```bash
pnpm db:reset-local
# or: reset_dev_db.sql in SQL Editor, then:
pnpm db:push
pnpm db:types:all:local   # or db:types against linked
pnpm -C packages/shared build
```

**SQL smoke (must all succeed):**

```sql
-- types / tables
SELECT typname FROM pg_type WHERE typname = 'tenant_plan';
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'tenants'
    AND column_name IN ('plan','skin','rapyd_config','yesh_config','tranzila_terminal_name','google_calendar_id');
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'offerings' AND column_name IN ('offering_type','duration_mins');
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'offerings' AND column_name = 'is_bookable';  -- must return 0 rows
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'payments'
    AND column_name IN ('b2b_flag','allocation_number','tranzila_pr_id');
SELECT to_regclass('public.scheduling_holds');
SELECT to_regclass('public.bookings');  -- must be NULL
SELECT to_regclass('public.tenant_configs');  -- must be NULL

-- functions
SELECT proname FROM pg_proc WHERE proname IN (
  'get_available_slots','create_scheduling_hold','get_schedule_events',
  'provision_tenant','get_tenant_config_by_subdomain',
  'save_tenant_rapyd_credentials','save_tenant_yesh_credentials',
  'get_tenant_google_credentials','replace_tenant_scheduling_hours'
);
```

**Failure = not done.** Fix migrations in place and re-reset; do not stack fixup ALTERs.

---

## Implementation checklist

| # | Task | Done |
| --- | --- | --- |
| 1 | Archive superseded migrations + README | ✅ |
| 2 | Bake 00200 tenants + verticals + enum | ✅ |
| 3 | Bake 00500 offerings | ✅ |
| 4 | Bake 01300 engagements | ✅ |
| 5 | Bake 01600 payments + Rapyd/Yesh/Tranzila RPCs | ✅ |
| 6 | Update 01800 / 02400 public + provisioning | ✅ |
| 7 | Write 02500 features (fold 030–032) | ✅ |
| 8 | Write 02600 scheduling (fold 033–042 finals) | ✅ |
| 9 | Write 02700 grants | ✅ |
| 10 | Write 02800 jobs | ✅ |
| 11 | Delete superseded from migrations/ | ✅ |
| 12 | reset_dev_db + seeds + SPEC + plans README | ✅ |
| 13 | Verify apply + smoke SQL + types | ☐ (user: SQL Editor reset → push → seed) |
| 14 | Audit fixes: Google lockdown, booking/provider grants, single RPC defs | ✅ |

---

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| `skin` FK before verticals seed | Seed verticals in 00200 before any tenant INSERT |
| Mid-chain `get_tenant_config` missing plan cols | Define final config RPC only after feature helpers exist |
| Grants before scheduling | Grants file after scheduling |
| Accidental Jul file left in migrations/ | Checklist + `ls migrations/*202607*` must be empty |
| Seed still uses `is_bookable` | Grep seeds; fix to `offering_type` |
| Duplicate function mid-chain | Prefer single definition; DROP IF EXISTS before recreate if signature changes |

---

## Done criteria

1. `supabase/migrations/` contains only the new ordered chain (no `202607*`, no intermediate `03000`–`04200`).
2. Fresh reset + push applies with exit code 0.
3. Smoke SQL passes; `bookings` / `tenant_configs` absent.
4. SPEC §4.2.0 matches filenames.
5. Types regenerate cleanly.

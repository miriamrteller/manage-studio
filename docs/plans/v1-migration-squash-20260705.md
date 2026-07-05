# V1 migration third squash + reset + seed (paste into new agent chat)

**Status:** **Ready** for automated implementation (2026-07-05)

### Agent-readiness checklist

| Criterion | Status |
| --- | --- |
| Exact fold map (13 incrementals → base files) | ✅ |
| Dashboard RPC tenant bug fix during fold | ⚠️ **Required** — `get_my_tenant_id()` not `auth.uid()` |
| Supersession rules (290001 over 016/280001, 01120000 over blast) | ✅ |
| `reset_dev_db.sql` additions listed | ✅ |
| `seed-finance.sql` fixture rows specified | ✅ |
| Archive path + delete incrementals | ✅ |
| Verification commands | ✅ |
| SPEC §4.2.0 update instructions | ✅ |
| pg_cron scheduling | ❌ **Out of scope** — [v1-pg-cron-scheduled-jobs.md](v1-pg-cron-scheduled-jobs.md) follow-on |

**Verdict:** Ready to paste into a new agent chat. **Schema-only PR** — no app code changes unless types/tests fail after `db:types`.

---

## Mission

Perform the **third pre-V1 migration squash**: fold **13 post-base incrementals** (`20260625*`–`20260705*`) into the **`20260608*` base chain** (`00200`–`02500`), archive superseded SQL, update **`reset_dev_db.sql`** and **`seed-finance.sql`**, update **SPEC §4.2.0**.

**Repo:** `manage-studio`  
**Branch:** branch from `main`  
**Precondition:** No production DB has applied the 13 incrementals (dev reset acceptable).  
**Out of scope:** pg_cron migration, app feature code, pg_cron plan implementation.

---

## Hard rules

1. **Do not** add new numbered migrations after squash — end state is **24 files only** in `supabase/migrations/`.
2. **Replace** function bodies where incrementals supersede base (do not leave duplicate definitions).
3. For notification blast: fold **only** `20260701120000_notification_blast_human_search.sql` (final RPC signatures).
4. For Grow/iCount creds: fold **`20260629000100`** versions of `save_tenant_grow_credentials` and `save_tenant_icount_credentials` (token invalidation). Fold **`save_icount_webhook_secret`** from `20260628000100`.
5. Payment dunning: bake columns into **`CREATE TABLE engagements`** — no standalone `ALTER` migration.
6. Archive all 13 incrementals to `supabase/migrations_backup/incremental_20260705/` then **delete** from `supabase/migrations/`.
7. Update SPEC §4.2.0 changelog + index (third squash note).
8. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `SPEC.md` §4.2.0 — existing squash policy (2026-06-08, 2026-06-24)
2. All 13 incremental files listed in Step 1 below (read each fully)
3. Target base files (tails of each — avoid duplicate CREATE)
4. `supabase/reset_dev_db.sql`
5. `supabase/seed.sql`, `supabase/seed-finance.sql`
6. `supabase/migrations/20260608002500_grants.sql` — add missing table grants

---

## Step 1 — Fold map (13 → base)

| Delete after fold | Fold into | Keep |
| --- | --- | --- |
| `20260625000100_expenses.sql` | `01600_finance.sql` | Table, triggers, RLS, `create_expense`, `reject_expense_mutation`, `validate_expense_category_tenant` |
| ↑ storage section | `01700_storage.sql` | `expense-receipts` bucket + policies (from end of 250001) |
| `20260625000200_finance_summary_rpc.sql` | `01600_finance.sql` (after expenses) | `get_finance_summary` |
| `20260625000300_grow_webhook_secrets.sql` | `01600_finance.sql` | `grow_webhook_secrets`, `get_grow_webhook_secret`, `save_grow_webhook_secret`, RLS |
| `20260625000500_grow_admin_document_rpcs.sql` | `01600_finance.sql` | `admin_get_payment_document`, `admin_get_document_signed_url_path` |
| `20260628000100_icount_credentials.sql` | `01600_finance.sql` | **`save_icount_webhook_secret` only** (not `save_tenant_icount_credentials` — use 290001) |
| `20260629000100_provider_token_invalidation.sql` | `01600_finance.sql` | **Replace** `save_tenant_grow_credentials` in 016; add final `save_tenant_icount_credentials` |
| `20260626000100_age_engagement_helpers.sql` | `02100_guest_enrolment_rpcs.sql` | `engagement_age_at_season_start`; **replace** `guest_enrolment_create_engagement` (age gate + `age_at_season_start` on INSERT); keep trailing GRANTs |
| `20260626000200_age_review_rpcs.sql` | `02200_admin_enrolment_rpcs.sql` | All age-review RPCs + GRANTs |
| `20260626000300_admin_dashboard_overview_rpc.sql` | `02000_admin_rpcs.sql` | `get_tenant_today`, `idx_offerings_season_dow_status`, `get_admin_dashboard_overview` |
| `20260701000100_notification_blast_rpcs.sql` | — | **Discard** (superseded) |
| `20260701100100_notification_blast_account_filter.sql` | — | **Discard** (superseded) |
| `20260701120000_notification_blast_human_search.sql` | `00600_communications.sql` | Final blast RPCs + GRANTs |
| `20260705000100_payment_dunning_foundation.sql` | `01300_engagements.sql` + `00600_communications.sql` | See Step 2 |

**Dependency order preserved:** filename order unchanged (`016` before `020` before `021`…).

---

## Step 2 — Payment dunning (bake into CREATE)

**File:** `supabase/migrations/20260608001300_engagements.sql`

Add to `CREATE TABLE engagements` (before `created_at`):

```sql
  payment_dunning_attempt_count INT NOT NULL DEFAULT 0,
  payment_dunning_next_at       TIMESTAMPTZ,
```

Add COMMENTs from `20260705000100_payment_dunning_foundation.sql`.

**File:** `supabase/migrations/20260608000600_communications.sql`

Append after `notification_log` indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dunning_key
  ON notification_log (tenant_id, template_name, (variables->>'dunning_key'))
  WHERE (variables->>'dunning_key') IS NOT NULL
    AND status IN ('sent', 'delivered', 'read', 'pending');
```

(`EngagementSchema` in `packages/shared` already has these fields — no schema change unless drift.)

---

## Step 3 — Grants (`02500_grants.sql`)

Add to `GRANT SELECT ON TABLE` list for `authenticated`:

- `public.expenses`
- `public.grow_webhook_secrets`

(RPC EXECUTE grants remain inline in folded sections — verify none missing.)

---

## Step 4 — Archive + delete incrementals

1. Copy all 13 files → `supabase/migrations_backup/incremental_20260705/`
2. Add `supabase/migrations_backup/incremental_20260705/README.md`:

   ```text
   Third squash (2026-07-05). Folded into 20260608* base chain. Do not re-apply.
   ```

3. Delete the 13 files from `supabase/migrations/`

**End state:** exactly **24** files: `20260608000200` through `20260608002500`.

---

## Step 5 — Update `reset_dev_db.sql`

Add before dropping `notification_log`:

```sql
DROP INDEX IF EXISTS public.idx_notification_log_dunning_key;
DROP INDEX IF EXISTS public.idx_offerings_season_dow_status;
```

Extend the dynamic `DO $$ ... proname IN (...)` block with:

```text
get_finance_summary
get_admin_dashboard_overview
get_tenant_today
engagement_age_at_season_start
assert_age_ineligible_for_offering
resolve_engagement_billing_account
assert_can_request_age_review
request_age_review_engagement
guest_enrolment_request_age_review
approve_age_review_engagement
decline_age_review_engagement
get_grow_webhook_secret
save_grow_webhook_secret
save_tenant_icount_credentials
save_icount_webhook_secret
```

Add dynamic drop loop for **`resolve_notification_blast_recipients`** and **`preview_notification_blast_recipients`** (all overloads — copy pattern from `20260701120000`).

Update final `RAISE NOTICE` to mention third squash + run `seed-finance.sql` after base seed.

---

## Step 6 — Update `seed-finance.sql`

### 6a — Dunning cron dev fixtures

On existing `pending_payment` engagement **`00000000-0000-0000-0000-000000001001`** (or add `1005`):

| Field | Value |
| --- | --- |
| `created_at` | `now() - interval '5 days'` (Day 3+ eligible) |
| `payment_dunning_attempt_count` | `0` |
| `payment_dunning_next_at` | `NULL` |

Optional second row **`1002`** (**already seeded** as `pending_payment` — **UPDATE**, do not insert a duplicate):

| Field | Value |
| --- | --- |
| `payment_dunning_attempt_count` | `1` |
| `payment_dunning_next_at` | `now() - interval '1 hour'` |

Include columns in INSERT + `ON CONFLICT DO UPDATE`.

### 6b — Verify existing fixtures

- Expenses + categories — already present ✅
- Tenant `grow`/`grow` — already in seed-finance ✅
- `grow_webhook_secrets` — already seeded ✅

### 6c — Header comment

Document post-squash run order:

```text
reset_dev_db.sql → pnpm db:push → seed.sql → seed-finance.sql
```

---

## Step 7 — Docs

**SPEC.md §4.2.0:**

- Add block: **2026-07-05 — third squash.** Folded `20260625*`–`20260705*` into base chain; archived at `migrations_backup/incremental_20260705/`.
- Extend index table rows for folded content (expenses, grow webhook, blast RPCs, dunning columns, age review, admin dashboard RPC).
- Fix prose: full **`expenses`** table **is** in V1 (was incorrectly marked deferred).

**docs/IMPLEMENTATION_STATUS.md:** Note single 24-file migration chain; remove separate incremental migration rows if listed.

**docs/plans/README.md:** Add row — squash plan Ready.

---

## Step 8 — Verification (agent MUST run)

```bash
# After user runs reset_dev_db.sql in SQL Editor:
pnpm db:push
pnpm db:types:all:local
pnpm -C packages/shared build
pnpm -C apps/web test schemas.test.ts finance-schemas.test.ts payment-dunning-collections.test.ts enrolment-payment-dunning.test.ts
```

**Manual SQL checks** (local or SQL Editor after push):

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'engagements' AND column_name LIKE 'payment_dunning%';

SELECT indexname FROM pg_indexes WHERE indexname = 'idx_notification_log_dunning_key';

SELECT proname FROM pg_proc WHERE proname = 'get_finance_summary';
```

**Confirm:** `supabase/migrations/` lists **24 files only** — no `20260625*` or `202607*`.

---

## Definition of done

- [ ] 13 incrementals folded; 24-file chain only
- [ ] Archive at `migrations_backup/incremental_20260705/`
- [ ] `reset_dev_db.sql` updated
- [ ] `seed-finance.sql` dunning fixtures
- [ ] SPEC §4.2.0 updated
- [ ] Tests green after fresh reset + push + seed
- [ ] No pg_cron SQL in this PR

---

## Out of scope

| Item | Plan |
| --- | --- |
| pg_cron `cron.schedule` migration | [v1-pg-cron-scheduled-jobs.md](v1-pg-cron-scheduled-jobs.md) |
| Class calendar UI (FullCalendar) | V2 / not planned |
| App code changes | Only if types/tests require |

---

## Audit notes (2026-07-05 — Supabase apply + architecture)

### Apply blockers (must fix during squash)

| Severity | Issue | Resolution |
| --- | --- | --- |
| **High** | `get_admin_dashboard_overview` uses `auth.uid()` as `v_tenant_id` (line 100 in `20260626000300`) — comment says “same as `get_finance_summary`” but that RPC uses `get_my_tenant_id()`. Dashboard always misses seasons/counts → **P0001 “No active season”** for every real tenant. | When folding into `02000`, change to `v_tenant_id := get_my_tenant_id();` + NULL check (mirror `get_finance_summary`). |
| **High** | `save_tenant_grow_credentials` exists in base `01600` **and** `290001` — fold must **replace in place** (lines ~172–206), not append a second definition. | Delete old body; paste `290001` version (token invalidation). |
| **High** | Three blast migrations — only `01120000` survives | Fold `01120000` only (includes overload drop DO block). |
| **Medium** | `save_tenant_icount_credentials`: fold **`290001` only**; **`280001`** contributes **`save_icount_webhook_secret` only** — including both icount cred RPCs duplicates definition. | Step 1 supersession rule — verify agent did not paste `280001` cred RPC. |

### Apply-safe (no migration error; verify agent discipline)

| Severity | Issue | Resolution |
| --- | --- | --- |
| **Low** | Notification blast folded into `00600` runs **before** `01300` engagements — OK for **plpgsql** (`CREATE FUNCTION` does not require relations at define time). | Keep in `00600` or move to `02000` if you prefer dependency clarity — not a Supabase apply error. |
| **Low** | `get_tenant_today` DO block: no `tenants.timezone` column in V1 base → always UTC `CURRENT_DATE`. Admin “today’s classes” uses UTC date, not Jerusalem. | Accept for V1 or add `timezone` column + branch (3) in a follow-on — not a squash apply error. |
| **Low** | `reset_dev_db` plan places `DROP INDEX idx_offerings_season_dow_status` before `notification_log`, but index is on `offerings` (already dropped ~line 75). | Harmless `IF EXISTS` no-op; optional: move drop before `DROP TABLE offerings`. |
| **Low** | `reset_dev_db` already drops `expenses`, `grow_webhook_secrets`, and many finance RPCs — Step 5 is **partial** (still add dashboard/blast/icount RPCs + dunning index drop). | Complete Step 5 additions only. |

### Grants / reset completeness

| Severity | Issue | Resolution |
| --- | --- | --- |
| **Medium** | `02500_grants.sql` has `expense_categories` but not `expenses` or `grow_webhook_secrets`. | Step 3 — confirmed still required. |
| **Medium** | `reset_dev_db` DO block missing: `get_admin_dashboard_overview`, `get_tenant_today`, `save_tenant_icount_credentials`, `save_icount_webhook_secret`, blast RPC overload drop loop. | Step 5 — add to existing DO block / new loop. |

### Seed plan corrections

| Severity | Issue | Resolution |
| --- | --- | --- |
| **Medium** | Engagement **`1002`** already exists as `pending_payment` in `seed-finance.sql` — plan “optional if not conflicting” is ambiguous. | **Update row `1002`** for step-2 dunning fixture (`payment_dunning_attempt_count = 1`, backdated `payment_dunning_next_at`). Extend `ON CONFLICT DO UPDATE` with `created_at`, dunning columns. |
| **Low** | Row **`1001`**: set `created_at = now() - interval '5 days'` in INSERT/UPDATE so Day 3+ cron eligibility is deterministic. | Step 6a — include in conflict update. |

### Data placement (industry alignment — locked hybrid architecture)

| Data | Table | Verdict |
| --- | --- | --- |
| Enrolment dunning ladder | `engagements.payment_dunning_*` | ✅ Correct — state on enrolment aggregate |
| Renewal dunning / retries | `billing_schedules.attempt_count`, `next_attempt_at`, `last_error` | ✅ Correct — billing obligation SSOT |
| Dunning send idempotency | `notification_log.variables->>'dunning_key'` + partial unique index | ✅ Acceptable V1; dedicated `idempotency_key` column would be cleaner at scale |
| Expenses (immutable ledger) | `expenses` + correction rows | ✅ Standard finance pattern |
| Grow webhook rotation | `grow_webhook_secrets` (versioned) | ✅ Correct — separate from API creds on `tenants` |
| Grow/iCount API creds | `tenants.payment_provider_*_enc` | ✅ Standard multi-tenant encrypted columns |
| iCount webhook secret | `tenants.payment_provider_webhook_enc` | ✅ OK for single rotating secret; document asymmetry vs Grow table in SPEC |
| Async invoicing | `document_queue` | ✅ Standard outbox |
| OTP / verification cleanup | SQL RPCs in `00700` | ✅ Correct — no edge fn needed |

### Original squash checklist

| Severity | Issue | Resolution |
| --- | --- | --- |
| **High** | Chat-only plan not on disk | This file |
| **Low** | finance `00-overview` says 016 frozen | SPEC pre-prod squash policy wins |

# Backup & restore runbook — production database

**Written:** 2026-08-07 · Workflow: [.github/workflows/backup-prod.yml](../../.github/workflows/backup-prod.yml)

Free-tier Supabase has **no PITR and no daily backups**. A nightly GitHub
Actions job dumps the prod database (schema + data + manifest), encrypts it,
and uploads it to a private Cloudflare R2 bucket. Retention: 30 nightlies,
13 monthlies (R2 lifecycle rules, applied by the job itself).

**A backup nobody has restored is a hope, not a backup — rehearse §Full
restore once after setup, and again before the first real tenant.**

- Bucket: `manage-studio-db-backups` (private; **not** inside the Supabase
  project — a backup stored inside the thing it protects dies with it)
- Object layout: `nightly/<date>_<sha>.tar.gz.gpg` + `.manifest.json`;
  `predeploy/<time>_<sha>…` taken by deploy-prod right before every prod
  deploy (no lifecycle rule — add `predeploy/` 400 days in the dashboard if
  wanted). Both made by `scripts/ci/backup-prod-to-r2.sh`. Since 2026-11-01
  the tarball also holds `migrations.csv` (see §Migration history)
  (the manifest is plaintext: date, main SHA, migration count, checksums —
  it ties every dump to the exact app version that produced it)
- Encryption: gpg to the `OpalSwift DB Backups v2` key
  (`78851A6D0ECC930F318E33E69199DE35E6163A41`). Public key lives in the repo
  (`.github/backup-encryption-public-key.asc`); the **private key exists
  only in the password manager**. Losing it makes every backup unreadable —
  it is exactly as precious as the DB encryption key.
  *(History: the v1 key's private half was lost to temp-folder cleanup on
  2026-08-16, before any readable backup existed. Every v1-era nightly —
  2026-08-17 through the morning run of 2026-08-20, four in total, since the
  schedule kept running until the v2 rotation merged — was permanently
  unreadable; all were deleted on 2026-08-20. The first verified v2 backup
  landed the same day and passed a full restore rehearsal: object downloaded
  from R2, decrypted with the password-manager key, checksums matched the
  manifest.)*
- Retention lifecycle rules were set by hand in the dashboard on 2026-08-20
  (prefix `nightly/` expire 30 days; prefix `monthly/` expire 400 days),
  because the Object R&W token lacks bucket-admin rights. The workflow's own
  lifecycle step stays best-effort and warns instead of failing — ignore the
  warning; the dashboard rules govern.
- The dump includes `private.platform_config` (cron secret, and the
  encryption key once set) and all tenant PII — which is *why* it is
  encrypted before upload.
- **Known gap:** Supabase Storage files (waiver evidence PDFs, retained
  document PDFs) are not covered — this is the database only. File backup
  is a separate follow-up.

## Setup (owner, one-time)

1. **Enable R2** on the Cloudflare account (Dashboard → R2 → purchase/enable;
   free tier covers this comfortably, a payment method is required).
2. **Create the bucket** `manage-studio-db-backups` (location hint: EU, to
   match the Frankfurt data-residency reasoning in GO-LIVE-PLAN).
3. **R2 API token**: R2 → Manage API Tokens → Create — *Object Read & Write*,
   scoped to this one bucket. Note the Access Key ID + Secret.
4. **Repo secrets** (GitHub → Settings → Secrets and variables → Actions),
   or from a checkout with `gh` logged in:

   ```bash
   gh secret set R2_ACCOUNT_ID
   ```
   ```bash
   gh secret set R2_ACCESS_KEY_ID
   ```
   ```bash
   gh secret set R2_SECRET_ACCESS_KEY
   ```
   ```bash
   grep -E "^SUPABASE_DB_PASSWORD=" .env.prod | cut -d= -f2- | xargs -I{} printf 'postgresql://postgres.oogxajjanbyqhljxcmql:{}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' | gh secret set SUPABASE_PROD_DB_URL
   ```
   (The pooler host `aws-0-eu-central-1` is verified; the direct `db.<ref>`
   host is IPv6-only and unreachable from GitHub runners too.)
5. **Store the private key**: move the generated
   `backup-private-key-STORE-IN-PASSWORD-MANAGER.asc` into the password
   manager, then delete the file.
6. **Test**: Actions → backup-prod → Run workflow. Green run + an object in
   the bucket, then rehearse §Full restore below.

Until secrets exist the job exits early with a notice (never a red X), so
merging this before R2 is enabled is safe.

## Full restore

1. Download the newest `nightly/...tar.gz.gpg` (+ manifest) from R2.
2. Decrypt and unpack (import the private key from the password manager first):
   ```bash
   gpg --import backup-private-key.asc
   gpg -d backup.tar.gz.gpg | tar xz   # → schema.sql, data.sql, manifest.json
   ```
3. Create a fresh Supabase project (or use the damaged one after a reset).
4. Check out the repo at `main_sha` from the manifest — that guarantees the
   Edge Functions and app match the schema you are restoring.
5. Apply, via the session pooler URL of the target project:
   ```bash
   psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f schema.sql
   psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f data.sql
   ```
5b. Restore the migration history (§Migration history) — otherwise the next
   `supabase db push` tries to re-run every migration.
6. Re-point/redeploy: `supabase link` to the target ref, deploy functions,
   re-run Phase C secrets if the ref changed, update DNS-facing config
   (`VITE_SUPABASE_URL` needs a frontend rebuild if the ref changed).
7. `pnpm verify:prod` against the restored project.

## Migration history

`supabase db dump` does **not** include `supabase_migrations.schema_migrations`
(found 2026-11-01). Without it a restored project looks unmigrated, and the
next `db push` (by hand or by deploy-prod) re-runs every migration over the
existing tables. After step 5:

```bash
psql "$TARGET_DB_URL" -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations" \
  -c "CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)" \
  -c "\copy supabase_migrations.schema_migrations (version, name) FROM 'migrations.csv' CSV HEADER"
```

Backups from before 2026-11-01 have no `migrations.csv`: the history is the
first `manifest.migrations` files in `supabase/migrations` at `manifest.main_sha`.
Mark them with `supabase migration repair --status applied <version> …` against
the target, then `supabase migration list` must show local = remote.

## Restore rehearsal (local, no hosted project)

```bash
gpg --import backup-private-key.asc          # from the password manager
scripts/restore-rehearsal.sh <backup.tar.gz.gpg>
```

Decrypts, checks the manifest checksums, restores schema + data + migration
history into a throwaway local Supabase Postgres container, compares the
migration count with the manifest and prints row counts. Deletes everything on
exit. **2026-11-01:** run end-to-end on a backup made by the pipeline script
(real `supabase db dump`, throwaway gpg key, from a local replay of all
migrations): passed. This is what surfaced the missing migration history.
Repeat with a real R2 backup and the real key before the first paying tenant.

## Per-tenant restore (one client's data damaged, others fine)

Never restore a full dump over a live multi-tenant database. Instead:

1. Full-restore the dump into a **scratch** Supabase project (§above, steps
   1–5 only).
2. Every tenant-owned table carries `tenant_id`. Extract only the affected
   tenant from the scratch DB, e.g.:
   ```bash
   psql "$SCRATCH_DB_URL" -c "\copy (SELECT * FROM engagements WHERE tenant_id = '<TENANT>') TO 'engagements.csv' CSV HEADER"
   ```
   Repeat per damaged table (payments, people, accounts, …) — consult the
   FK order in the migrations when re-inserting.
3. Reconcile into prod with explicit `INSERT ... ON CONFLICT` statements in a
   transaction — reviewed by hand, never blind `\copy` into the live DB.
4. Delete the scratch project when done (it contains every tenant's data).

## Monitoring

A failed nightly run emails the repo owner (GitHub default for scheduled
workflows). Treat two consecutive failures as an incident — that is a 2-day
backup gap on a database with no other recovery path.

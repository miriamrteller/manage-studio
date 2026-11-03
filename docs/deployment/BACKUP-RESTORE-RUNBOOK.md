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
- **Storage files** (signed form and contract PDFs, legal documents, logos,
  attachments: every bucket) are backed up by the same workflow's `files` job,
  encrypted, under `files/` in the same R2 bucket. See §Files.

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

## Files (Supabase Storage)

The `files` job in backup-prod runs `scripts/ci/backup-files-to-r2.sh` every night.
It copies only new or changed objects (rclone sync, compared by size and time),
from **every** prod bucket, so a bucket added later is covered without changes.

| R2 prefix (bucket `manage-studio-db-backups`) | What | Kept |
| --- | --- | --- |
| `files/current/<bucket>/…` | Mirror of Storage as of last night | Always |
| `files/history/<YYYY-MM-DD>/<bucket>/…` | Files deleted or replaced that night | 30 days |
| `files/monthly/<YYYY-MM>/<bucket>/…` | Copy of the mirror on the 1st | 400 days |

**Why encrypted, and how.** The PDFs carry signers' ID numbers and addresses, so
they get the same protection as the database dump. GPG does not suit an
incremental mirror (each night would re-upload everything), so the files use
rclone's `crypt`: each file's name and contents are encrypted with
`FILES_BACKUP_PASSWORD` + `FILES_BACKUP_SALT`. Folder names stay readable (bucket,
tenant id, document type; no personal data) so the 30-day and 400-day rules can
match their prefixes. Losing the password and salt makes the file backups
unreadable: keep both in the password manager next to the GPG key.

Safety stops: the job refuses to sync when Storage lists no objects but the
backup has some (wrong key or outage), and stops after 200 deletions in one
night. Anything it would have deleted is in `files/history/` for 30 days.

If the database or files backup fails, the `report` job opens (or comments on)
one issue labelled `backup-failed`. Close it once a night runs green.

### Setup (owner, one-time)

1. **Supabase S3 access key** (prod project): Dashboard → Project Settings →
   Storage → **S3 Connection** → *New access key*. It can read every bucket and
   bypasses RLS: treat it like the service-role key.
2. **Encryption password and salt**: two long random strings, e.g.
   ```bash
   openssl rand -base64 48
   ```
   Run it twice. Save both in the password manager **first**.
3. **GitHub secrets** (in the `production-nightly` environment, like
   `SUPABASE_PROD_DB_URL`; repo-level also works). The R2 secrets are reused.
   ```bash
   gh secret set SUPABASE_PROD_S3_ACCESS_KEY_ID --env production-nightly
   ```
   ```bash
   gh secret set SUPABASE_PROD_S3_SECRET_ACCESS_KEY --env production-nightly
   ```
   ```bash
   gh secret set FILES_BACKUP_PASSWORD --env production-nightly
   ```
   ```bash
   gh secret set FILES_BACKUP_SALT --env production-nightly
   ```
4. **R2 lifecycle rules** (Dashboard → R2 → `manage-studio-db-backups` →
   Settings → Object lifecycle rules), next to the existing two:
   prefix `files/history/` expire after **30 days**; prefix `files/monthly/`
   expire after **400 days**. No rule for `files/current/`.
5. **Test**: Actions → backup-prod → Run workflow. The `files` job summary shows
   the object count. Then restore one file (below) to prove the password works.

Until the secrets exist the job skips with a notice (never a red X).

### Restore files

On a trusted machine with `rclone` installed, set the remotes for this shell
only (values from the password manager and the Cloudflare/Supabase dashboards):

```bash
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ENDPOINT="https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com" \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=<R2 key id> RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<R2 secret>
export RCLONE_CONFIG_VAULT_TYPE=crypt RCLONE_CONFIG_VAULT_REMOTE=r2:manage-studio-db-backups/files \
  RCLONE_CONFIG_VAULT_FILENAME_ENCRYPTION=standard RCLONE_CONFIG_VAULT_DIRECTORY_NAME_ENCRYPTION=false \
  RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure '<FILES_BACKUP_PASSWORD>')" \
  RCLONE_CONFIG_VAULT_PASSWORD2="$(rclone obscure '<FILES_BACKUP_SALT>')"
```

- **Look**: `rclone ls vault:current/tenant-legal-documents/<tenant id>` shows the
  real file names.
- **One file back** (deleted or replaced by mistake): find it in
  `vault:history/<date>/…` (or `vault:current/…`), then
  `rclone copy vault:history/<date>/<bucket>/<path> ./restore/` and upload it
  in the Supabase dashboard to the same bucket and path.
- **A whole bucket or project** (after a database restore into a new project):
  add that project's S3 key as a `target` remote
  (`RCLONE_CONFIG_TARGET_TYPE=s3`, `_PROVIDER=Other`,
  `_ENDPOINT=https://<new ref>.storage.supabase.co/storage/v1/s3`,
  `_REGION=eu-central-1`, `_FORCE_PATH_STYLE=true`, key id and secret), create the
  buckets with the same names and settings (they are in the migrations), then
  `rclone copy vault:current target: --transfers 8`.
  For a past month use `vault:monthly/<YYYY-MM>` instead.
- Paths are the same as in Storage, so the database rows that point at files
  (`storage_path` columns) stay valid.

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
- Object layout: `nightly/<date>_<sha>.tar.gz.gpg` + `.manifest.json`
  (the manifest is plaintext: date, main SHA, migration count, checksums —
  it ties every dump to the exact app version that produced it)
- Encryption: gpg to the `OpalSwift DB Backups` key
  (`77C1129EBECF2E881EB861931750DBBC7A803D6C`). Public key lives in the repo
  (`.github/backup-encryption-public-key.asc`); the **private key exists
  only in the password manager**. Losing it makes every backup unreadable —
  it is exactly as precious as the DB encryption key.
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
6. Re-point/redeploy: `supabase link` to the target ref, deploy functions,
   re-run Phase C secrets if the ref changed, update DNS-facing config
   (`VITE_SUPABASE_URL` needs a frontend rebuild if the ref changed).
7. `pnpm verify:prod` against the restored project.

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

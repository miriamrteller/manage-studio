# Prod tasks: one-off data changes on prod

A **prod task** is a reviewed SQL file that changes *data* on prod once: a
tenant bootstrap row, a data fix, a one-time config row. It replaces pasting
SQL into the Supabase SQL editor. Schema changes are never prod tasks; they
are migrations ([DEV-PROD-PIPELINE.md](DEV-PROD-PIPELINE.md#rules)).

Workflow: `.github/workflows/prod-task.yml`. Checker: `scripts/ci/prod-task.mjs`.

## Write one

1. Add `supabase/prod-tasks/<UTC timestamp>_<what_it_does>.sql`, e.g.
   `supabase/prod-tasks/20261103121500_fix_lead_status.sql` (`date -u +%Y%m%d%H%M%S`).
2. Start it with a comment saying why, and what row counts you expect.
3. Only these statements: `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `SELECT`,
   `WITH`, `VALUES`, `DO $$ … $$`, `SET LOCAL`. Not allowed:
   - schema changes (`CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `TRUNCATE`, …): write a migration;
   - `BEGIN` / `COMMIT` / `ROLLBACK` / `SAVEPOINT`: the workflow owns the transaction;
   - psql backslash commands (`\i`, `\o`, `\copy`, `\gexec`, …) and `EXECUTE` in a `DO` block.
4. Prefer stable keys (ids, subdomains) in `WHERE`. Don't put personal data
   (names, emails, phone numbers) in the file if an id will do: the file stays in git.
5. Open a PR. CI checks every file in the folder; a reviewer reads the SQL. Merge to `main`.

## Run it

1. GitHub → **Actions** → **prod-task** → **Run workflow** → branch `main` →
   **file**: the file name only → optionally tick **dry_run**.
2. The **check** job confirms the file is on `main` and data-only, and links the
   exact file and its sha256. Read it, then **Review deployments** → **production**
   → **Approve and deploy**.
3. The **run** job:
   - refuses the file if it already ran (`private.prod_task_runs`);
   - runs it in **one transaction** together with its record row, with a 10 s lock
     timeout and a 5 min statement timeout;
   - prints each statement's row count (`UPDATE 3`, `DELETE 0`, `returned 2 row(s) (not shown)`).
     Row data and error detail are never printed (they can hold personal data);
     a failure shows only the SQLSTATE code (e.g. `23505` unique violation).
   - Any error rolls the whole file back and records nothing, so you can fix
     the file in a new PR and run it again.

**dry_run** runs the file, shows the counts, then rolls back and records nothing.
Use it to check the counts first; the real run still runs once.

## Rules

- **Each file runs once.** A second run of the same file name is refused. For a
  new change, add a new file. Don't edit a file after it ran (git and
  `private.prod_task_runs.sha256` show what ran).
- Prod tasks wait in the same queue as deploy-prod, so they never run during a deploy.
- They use the `production` environment and its `SUPABASE_PROD_DB_URL`, the same
  credentials as deploy-prod. Nothing to set up beyond that.
- The record table comes with migration `*_prod_task_runs`; run deploy-prod once
  after it merges before the first task.
- Something that cannot be a prod task (e.g. the encryption key, which must never
  be in git) stays a manual step in its own runbook.

## See what ran

Each run's summary on GitHub shows the file, its sha256 and the row counts.
On prod (a read-only query, e.g. in the SQL editor):

```sql
SELECT file_name, git_sha, actor, ran_at, run_url FROM private.prod_task_runs ORDER BY ran_at DESC;
```

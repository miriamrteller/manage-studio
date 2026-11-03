-- Record of prod tasks: reviewed one-off data changes in supabase/prod-tasks/
-- that the prod-task workflow runs (docs/deployment/PROD-TASKS.md).
--
-- The workflow inserts the row inside the task's own transaction, so a task
-- that fails leaves no row, and the primary key refuses a second run of the
-- same file. Only the database owner (the pipeline's connection) touches it.
CREATE TABLE private.prod_task_runs (
  file_name  text PRIMARY KEY,
  sha256     text NOT NULL,
  git_sha    text NOT NULL,
  run_url    text NOT NULL,
  actor      text NOT NULL,
  ran_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.prod_task_runs IS
  'One row per supabase/prod-tasks file that ran (prod-task workflow). Primary key = run once.';

ALTER TABLE private.prod_task_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.prod_task_runs FROM PUBLIC;
REVOKE ALL ON private.prod_task_runs FROM anon;
REVOKE ALL ON private.prod_task_runs FROM authenticated;
REVOKE ALL ON private.prod_task_runs FROM service_role;

# Manual Operations Runbook

Day-2 operations for manage-studio. For architecture details see [SPEC.md](../../SPEC.md).

## Auth & magic-link email

**Primary doc:** [deployment/AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md)

### Quick triage: magic link not sending

1. Run diagnostic script:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm auth:check-email
   ```
2. Open Dashboard → **Auth → Logs** — filter `magiclink` and the user's email.
3. If error is `Error sending magic link email`:
   - Configure **Auth → SMTP Settings** (Resend recommended)
   - Verify sender domain in Resend (SPF/DKIM)
4. If user not found:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm seed:auth-parent
   ```
   Then re-run `supabase/seed.sql` or `supabase/scripts/link-parent-user.sql`.

### Seed parent test user (hosted)

```bash
# 1. Migrations applied through 016
# 2. Create auth.users row
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
pnpm seed:auth-parent

# 3. Sync profiles/families (SQL Editor)
# Run supabase/seed.sql or supabase/scripts/link-parent-user.sql

# 4. Verify
# Run supabase/scripts/verify-seed.sql and verify-auth-setup.sql
```

### Local dev email

```bash
pnpm db:reset-local   # migrations + seed.sql (includes auth user)
pnpm dev
# Magic link emails → http://127.0.0.1:54324 (Inbucket)
```

Test parent login: `parent@ballet.test` / magic link or password `devpassword123`.

### Redirect URL changes

When adding a new frontend origin, update Dashboard → Auth → URL Configuration:

- Site URL (production)
- Redirect URLs: `https://NEW_ORIGIN/auth/callback`

App code uses `${window.location.origin}/auth/callback` — every origin must be allowlisted.

---

## Database operations

| Task | Command |
| --- | --- |
| Link project | `pnpm db:link` |
| Push migrations | `pnpm db:push` |
| Reset local DB + seed | `pnpm db:reset-local` |
| Regenerate types | `pnpm db:types` |
| Push + types | `pnpm db:sync` |

---

## Edge Function secrets

**Full pre-prod manual checklist (Grow `userId` / `pageCode` / `apiKey`, etc.):** [SPEC.md §7](../../SPEC.md#7-v1-production-deployment).

Push all known Edge secrets from repo-root `.env` (linked project):

```bash
pnpm secrets:edge
```

Writes `supabase/.temp/edge-secrets.env` then runs `supabase secrets set --env-file …`.  
Required in `.env`: `APP_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SEND_EMAIL_HOOK_SECRET`.  
Derives `GROW_NOTIFY_URL` / `ICOUNT_NOTIFY_URL` / `ISSUE_DOCUMENT_URL` from `VITE_SUPABASE_URL` or `SUPABASE_PROJECT_REF` when omitted.  
Optional keys (copied if set): Twilio, Google Calendar, `GROW_API_BASE`, `GROW_MOCK`, Anthropic, etc.

Grow merchant keys are **not** Edge secrets — enter `userId`, `pageCode`, `apiKey` in admin settings (`save_tenant_grow_credentials`). See [GROW-RUNBOOK.md](../plans/finance/GROW-RUNBOOK.md).

List secrets (names only): Dashboard → Edge Functions → Secrets.  
Narrower helpers still work: `pnpm secrets:email`, `pnpm secrets:google-calendar`.

---

## Email architecture reference

| Path | Purpose | Configuration |
| --- | --- | --- |
| Supabase Auth mailer | Magic-link login/signup | Dashboard SMTP + email templates |
| `send-otp-email` | Enrolment OTP codes | `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` |
| `send-notification` | Class/transactional notifications | Same Resend secrets |

Do not assume configuring Resend Edge secrets fixes magic-link login — Auth SMTP is separate.

---

## Related docs

- [SPEC.md §7 — Pre-deployment checklist](../../SPEC.md#7-v1-production-deployment)
- [plans/finance/GROW-RUNBOOK.md](../plans/finance/GROW-RUNBOOK.md)
- [AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md)
- [THIRD_PARTY_SERVICES.md](THIRD_PARTY_SERVICES.md): env map (local vs Edge vs Cloudflare Workers) · repo [`.env.example`](../../.env.example)
- [FRESH_DB_CRON_SMOKE.md](FRESH_DB_CRON_SMOKE.md)

---

## Fresh DB + cron validation (remote dev)

After reset + `pnpm db:push`, run:

```bash
pnpm smoke:cron:dev -- --print-gucs-sql   # paste SQL into Dashboard (no psql needed)
pnpm smoke:cron:dev
```

Full checklist: [FRESH_DB_CRON_SMOKE.md](FRESH_DB_CRON_SMOKE.md)

## Scheduled jobs (pg_cron)

1. Enable extensions in Supabase Dashboard: `pg_cron`, `pg_net`.
2. Apply migrations through `02700_cron_platform_config` (`pnpm db:push`).
3. Set cron HTTP settings in SQL Editor (**not** `ALTER DATABASE` — permission denied on hosted Supabase):

```sql
INSERT INTO private.platform_config (key, value) VALUES
  ('supabase_functions_url', 'https://<project-ref>.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

`cron_secret` and the Edge secret `CRON_SECRET` are set together by Actions →
**rotate-secrets** → `CRON_SECRET` (never by hand: [SHARED-SECRETS.md](SHARED-SECRETS.md)).

Or run `pnpm smoke:cron:dev -- --print-gucs-sql` and paste the generated statement.

4. Ensure Edge secrets include:
   - `CRON_SECRET`
   - `APP_URL` (required before enabling enrolment payment dunning emails)
5. Migrations `20260608002600_scheduled_jobs.sql` + `20260608002700_cron_platform_config.sql` apply with `pnpm db:push`.
6. Verify jobs:

```sql
SELECT jobid, schedule, LEFT(command, 60) FROM cron.job ORDER BY schedule;
SELECT get_supabase_functions_url();
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

7. Monitor for failures in `cron.job_run_details`; failed `net.http_post` calls do not block schedule creation.

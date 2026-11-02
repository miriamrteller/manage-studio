# Lead email (leads-<sub>@opalswift.com → lead)

An email to `leads-<subdomain>@opalswift.com` becomes a lead on that studio's
leads page, and the studio gets a "new lead" email.

```
sender → opalswift.com MX → Email Routing catch-all
       → Worker lead-email-ingest (workers/lead-email-ingest)
       → prod Edge Function crm-lead-ingest (Bearer CRM_INGEST_SECRET)
       → leads table + alert to the studio's contact_email
```

## What changed (2026-11)

- The worker's committed `CRM_INGEST_URL` pointed at **dev**. It now points at
  **prod** (`oogxajjanbyqhljxcmql`). Email Routing only exists on opalswift.com,
  so the worker has one environment: prod.
- New workflow **deploy-lead-email**. It deploys the worker from `main`, after
  the owner approves (environment `production`), with wrangler from the
  package's own devDependency. It refuses a config that points anywhere but prod.

## Deploy

- Automatic on a merge to `main` that touches `workers/lead-email-ingest/**`
  (then approve).
- Or **Actions → deploy-lead-email → Run workflow**.
  - Tick **rotate_ingest_secret** to make a new `CRM_INGEST_SECRET` and set it
    on the worker **and** on prod Supabase in the same run. Nobody copies the
    value; it is never shown. The run then proves both sides match.

Each run checks:
- the worker has a `CRM_INGEST_SECRET` (names only);
- prod `crm-lead-ingest` is live and has its secret (an unauthenticated POST
  answers 401, not 503);
- the Email Routing catch-all is "Send to Worker: lead-email-ingest", when the
  Cloudflare token can read Email Routing (otherwise a notice; check by hand).

Uses the `production` secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
(same as deploy-web) and `SUPABASE_ACCESS_TOKEN` (same as deploy-prod).

## Owner checks (one time)

1. **First run:** Actions → deploy-lead-email → Run workflow → tick
   **rotate_ingest_secret** → Run → approve. This fixes the dev URL and makes
   the secret identical on both sides. It should end green.
2. **Catch-all → worker:** Cloudflare → opalswift.com → **Email → Email
   Routing → Routing rules → Catch-all address** → Action **Send to a
   Worker** → `lead-email-ingest` → **Enabled**. Do not add per-studio rules.
   Keep the existing rule for `hello@opalswift.com` (it is a separate,
   specific rule and wins over the catch-all).
3. **`CRM_CONTACTS_ALLOWED_ORIGIN`** (prod Edge secret, optional): one extra
   website origin allowed to post the public form directly, as well as
   `*.opalswift.com`. Leave it **unset** unless a specific site needs it; the
   embeddable form (iframe) does not need it. Check: Supabase → prod project →
   Edge Functions → Secrets.
4. **Test:** send an email from your own address to
   `leads-creativeballet@opalswift.com` (once that studio exists). Within a
   minute it should be on the studio's leads page (stage New, channel Email),
   and the studio's `contact_email` gets the alert. Sending the same message
   again must not add a second lead.

## If it fails

| Symptom | Likely cause | Fix |
|---|---|---|
| Run says "CRM_INGEST_SECRET is not set on prod Supabase" | prod Edge secret missing | Re-run with rotate_ingest_secret |
| Run says "not set on the worker" | worker secret missing | Re-run with rotate_ingest_secret |
| Run green but no lead appears | catch-all not bound to the worker | Owner check 2 |
| Lead appears in dev, not prod | an old worker version is live | Run deploy-lead-email |

Logs: `pnpm --filter @opalswift/lead-email-ingest exec wrangler tail lead-email-ingest`
(needs a Cloudflare login), or Cloudflare → Workers → lead-email-ingest → Logs.

**Rollback:** Cloudflare → Workers & Pages → lead-email-ingest → Deployments →
previous version → Rollback. A rollback to a version from before 2026-11 sends
leads to dev again; prefer fixing forward.

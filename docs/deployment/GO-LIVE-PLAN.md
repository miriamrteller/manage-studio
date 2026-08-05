# Go-live plan — Creative Ballet on opalswift.com

Working companion to the [SPEC §7 checklist](../../SPEC.md#7-v1-production-deployment).
§7 stays canonical for *what* must be true; this doc records **verified current
state**, the **order** to do things in, and **who** can do each step.

**Verified:** 2026-08-05 · `main` @ PR #31

> Everything below is verified against the repo. Nothing has been verified against
> a live production project, because one does not exist yet.

---

## Current state (verified, not assumed)

| | State |
|---|---|
| Code | `tsc` clean · 692 tests / 119 files · CI runs build + lint + test |
| Supabase Preview | ✅ green (fixed in #31 — per-function `deno.json`) |
| Dev DB | 32 migrations (was 34 — two folded away, see below); needs a reset to pick up the VAT-column removal |
| Payment providers | Grow, iCount, Invoice4U, YPay, Tranzila selectable; Green Invoice + Yesh for invoicing |
| Prod Supabase project | ❌ **does not exist** — everything is on dev `acmujrhavgbamdilzuew` |
| Cloudflare | ❌ nothing deployed; `apps/web/wrangler.jsonc` written but unused |
| `APP_URL` | ❌ `http://localhost:5173` |
| Mock flags | `GROW_MOCK`, `ICOUNT_MOCK`, `INVOICE4U_MOCK`, `YPAY_MOCK` all **on** (correct for dev) |
| Legal URLs / Sentry | ❌ unset / not installed |

---

## Order of work

Sequenced by **lead time**, not by importance — the slow items gate everything else.

### Phase A — start now, they wait on other people

These have external latency. Kick them off before anything else.

- [ ] **Resend domain verification** — add SPF + DKIM DNS records for the sending
      domain. DNS propagation plus Resend's check can take hours. Set
      `from_email` on the tenant (e.g. `noreply@creativeballet.co.il`).
- [ ] **Invoice4U clearing terminal** — still outstanding. Chase with error 96 as
      the concrete ask: *"our QA account has no clearing terminal attached —
      GetClearingAccount returns hasTerminal:false."* Readiness check is
      **Test connection** in Admin → Setup → Bundled payments: green means
      `isToken: true` **and** `isStandingOrder: true`.
- [ ] **Legal copy** — Privacy Policy + Terms need to exist before you can set
      `VITE_PRIVACY_POLICY_URL` / `VITE_TERMS_URL`. Waiver text wants a lawyer's
      eye; the accepted snapshot is already stored per enrolment.

### Phase B — production Supabase project

Everything downstream needs this to exist. **Use a separate project — do not
promote dev.** Dev carries mock-payment rows, demo tenants and test seeds.

- [ ] Create the project on **Pro** — free tier pauses after 7 days idle (would
      take a paying tenant offline) and PITR is Pro-only, which the documented
      rollback plan assumes.
- [ ] **Region: `eu-central-1` (Frankfurt).** Permanent at creation — a project
      cannot be moved. Supabase has no Israel region, and Frankfurt is both the
      lowest-latency option for Israeli users and the one that keeps the transfer
      lawful without extra paperwork. Reasoning in [Region choice](#region-choice).
      Do **not** inherit dev's `ap-northeast-2` (Seoul).
- [ ] Fill in `.env.prod`, then `pnpm env:use prod`. There is no `NODE_ENV`
      selector — `scripts/load-env.mjs` only ever reads the repo-root `.env`, so
      `.env` *is* the active environment. `.env.dev` / `.env.prod` are the stored
      copies; `pnpm env:use <dev|prod>` swaps one in and prints which project
      and `APP_URL` are now live. Switch back with `pnpm env:use dev`.
- [ ] `supabase link` to the new ref, then `pnpm db:push` — the 32-migration
      chain is the source of truth and replays clean (proven on the dev reset).
      ⚠️ `supabase link` is a **separate** switch from `pnpm env:use`: changing
      the env file does not retarget the CLI, and vice versa. Both must agree.
- [ ] `pnpm db:types:all` — then `git diff` the generated types. They should come
      back **identical** to what is committed. Any diff means the chain did not
      replay the way we think it did; stop and read the diff before continuing.
- [ ] SQL editor — **encryption key first, before anything touches credentials**:
      ```sql
      -- generate with: openssl rand -base64 32   (store in the password manager, never commit)
      INSERT INTO private.platform_config (key, value)
      VALUES ('encryption_key', '<generated>')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      ```
      The migrations deliberately seed **no** key, so until this runs the credential
      RPCs raise `app.encryption_key is not configured`. That failure is the safety
      net — see [the encryption-key trap](#traps-worth-remembering). There is no
      re-encrypt path, so changing this value later orphans every saved credential.
- [ ] SQL editor — cron config (same table, **not** `ALTER DATABASE`; hosted
      Supabase denies setting custom GUCs, which is why the fallback table exists):
      ```sql
      INSERT INTO private.platform_config (key, value) VALUES
        ('supabase_functions_url', 'https://<new-ref>.supabase.co'),
        ('cron_secret',            '<matches Edge CRON_SECRET>')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      ```
- [ ] Verify `pg_cron` + `pg_net` enabled and `cron.job` lists the scheduled jobs.
- [ ] **RLS spot-check with real data**: a parent sees only their own family; a
      teacher sees only their own tenant. Worth doing by hand — it is the one
      thing no test covers.
- [ ] **Bootstrap the first user — the trigger and the RPC deadlock otherwise.**
      `handle_new_user()` raises `No tenant available for new user` when the
      `tenants` table is empty, and `provision_tenant` raises `Owner user does
      not exist` when the owner has no `auth.users` row. On a fresh project both
      are true, so neither can go first. Break it by disabling the trigger for
      the bootstrap only:
      ```sql
      ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
      -- create the owner (Dashboard → Authentication → Users → Add user)
      -- then run provision_tenant below, then:
      ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
      ```
      No profile is lost: `provision_tenant` upserts the owner's `user_profiles`
      row as `tenant_admin`, which is what the owner needs anyway — the trigger
      would only have given them the default `account_holder` role.
      This is a one-time bootstrap; every later signup goes through the trigger.
- [ ] Provision the Creative Ballet tenant. `provision_tenant` is `service_role`
      only, so call it from the SQL editor with an explicit `p_owner_id`
      (`auth.uid()` is NULL there):
      ```sql
      SELECT provision_tenant('Creative Ballet Academy', 'creativeballet',
                              'professional', 'dance-studio',
                              'owner@…', '<auth.users id>');
      ```
      `verticals` (including `dance-studio`, which requires the `professional`
      plan) is seeded by migration `000200`, not by a seed file — nothing extra
      to run first.
- [ ] Seed invoice sequences.
- [ ] Run `node scripts/verify-prod-config.mjs` — checks the key is set and is not
      the dev value, cron config present, pg_cron/pg_net on, no dev tenants.

### Phase C — Edge secrets on the prod project

- [ ] `APP_URL=https://creativeballet.opalswift.com` — **not** localhost. Dunning
      links, waiver/pay links and the Google Calendar `redirect_uri` all derive
      from it.
- [ ] `CRON_SECRET` — same value as the DB GUC above.
- [ ] `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`
- [ ] Provider base URLs pointed at **production**, not sandbox.
- [ ] **Unset every mock flag**: `GROW_MOCK`, `ICOUNT_MOCK`, `INVOICE4U_MOCK`,
      `YPAY_MOCK`, `TRANZILA_MOCK`, `GOOGLE_CALENDAR_MOCK`,
      `SYNC_ISSUE_DOCUMENT_IN_DEV`.
      ⚠️ An **unset** provider mock flag means the LIVE adapter is used. Only unset
      one once that provider's credentials are saved and Test connection is green.
- [ ] `pnpm exec supabase functions deploy` against the prod ref.

### Phase D — Cloudflare

Decided earlier: **Workers, not Pages** — Pages cannot do wildcard custom domains,
which multi-tenant subdomains require.

- [ ] Confirm the zone spelling in Cloudflare (`opalswift.com`).
- [ ] Landing Worker → apex + `www`.
- [ ] App Worker → **route** `*.opalswift.com/*` plus a proxied wildcard DNS
      record. Custom Domains do **not** match wildcards. Register
      `app.opalswift.com` explicitly for the tenant-less shell (signup,
      post-payment onboarding, session handoff) — `app` is in
      `RESERVED_SUBDOMAINS`, so it correctly resolves to no tenant.
- [ ] Universal SSL covers apex + first-level subdomains free; no ACM needed.
- [ ] Build vars (`VITE_*` are inlined at **build** time — changing one needs a
      rebuild, not a redeploy):
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
      `VITE_APP_ROOT_DOMAIN=opalswift.com`,
      `VITE_PRIVACY_POLICY_URL`, `VITE_TERMS_URL`.
      **Do not set `VITE_DEV_TENANT_SUBDOMAIN`** — it is ignored in prod builds by
      design, but leaving it out removes all doubt.
- [ ] Supabase Auth → add `https://creativeballet.opalswift.com/auth/callback` to
      redirect URLs.
- [ ] `creativeballetacademy.com` stays a static landing that **links out** to
      `creativeballet.opalswift.com/enrol`. Mapping it onto the app would need
      Cloudflare for SaaS, and `resolveTenantSubdomain()` would read
      "creativeballetacademy" as a tenant.

### Phase E — first real payment

- [ ] Save the tenant's provider credentials via Admin → Setup → Bundled payments.
- [ ] **Test connection** green.
- [ ] One real end-to-end charge: payment → enrolment active → tax document PDF.
- [ ] Confirm the provider dashboard's notify URL points at
      `https://<prod-ref>.supabase.co/functions/v1/handle-payment-event`.

---

## Deliberately deferred

- **WhatsApp / Twilio** — SPEC calls it last; needs Meta template approval.
- **Sentry** — `@sentry/react` is not installed; wire when you want error
  monitoring.
- **Supabase client typing** — branch `wip/supabase-client-typing`, 70 errors
  remaining. Quality debt, not a launch blocker.
- **Self-serve signup** — `/create-studio` is gated behind
  `VITE_ENABLE_SELF_SERVE_SIGNUP` and `provision_tenant` is `service_role` only.
  Paid signup should provision from a verified payment webhook, never the browser.

---

## Region choice

**Decision: `eu-central-1` (Frankfurt).** Set at project creation and permanent —
Supabase cannot move a project between regions, only migrate to a new one.

*Why not Israel:* Supabase runs on AWS but does not offer AWS's Israel (Tel Aviv)
`il-central-1` region, nor anything in the Middle East. The available list is the
Americas, six European regions, and Asia-Pacific. Frankfurt is the closest
practical option; Israeli traffic reaches it over Mediterranean cable in well
under 100 ms, far better than dev's current Seoul (`ap-northeast-2`).

*Why it is lawful for student data, including minors:* Israel's Privacy Protection
Law as amended by **Amendment 13** (in force 14 August 2025) permits transfer
abroad where the destination provides an equivalent level of protection, and the
Privacy Protection Authority maintains an approved-country list. Germany is an EU
member state under the GDPR, which is the benchmark that standard is written
against — so an EEA destination is the well-trodden path rather than an argued
one. The reverse direction is also settled: the European Commission
**reconfirmed Israel's adequacy status on 15 January 2024**, so EU↔Israel flows
run on adequacy in both directions without Standard Contractual Clauses.

*What still needs doing regardless of region* (Phase A, not blocking Phase B):

- Amendment 13 raised the bar on **notice and consent**, and data about minors is
  handled as sensitive in practice — the enrolment flow already stores a consent
  snapshot per enrolment, but the Privacy Policy must state the destination
  (Germany/EU) and the processor (Supabase/AWS) explicitly.
- Amendment 13 carries a **notification duty to the PPA** for large-volume or
  high-risk transfers. One dance studio is not that, but the obligation should be
  re-checked before onboarding tenants at scale.
- A **data processing agreement** with Supabase should be on file.

None of this is legal advice — it is the reasoning behind picking Frankfurt over
Seoul, and it is worth a lawyer's eye alongside the waiver text in Phase A.

Sources: [Supabase available regions](https://supabase.com/docs/guides/platform/regions) ·
[Amendment 13 overview](https://iclg.com/practice-areas/data-protection-laws-and-regulations/israel) ·
[EU reconfirmation of Israel adequacy](https://www.lexology.com/library/detail.aspx?g=b7741368-3036-4ea2-b76d-2bd2a09028e0)

---

## Traps worth remembering

- **The encryption key fails open, so the migrations refuse to set one.**
  `get_app_encryption_key()` prefers the `app.encryption_key` GUC and falls back
  to `private.platform_config`. Hosted Supabase forbids setting that GUC, so the
  table is the only path — and a key committed in a migration would silently
  become production's key with no error. `000200` therefore seeds nothing;
  `supabase/seed.sql` seeds dev (seeds never run on prod) and Phase B inserts the
  real one by hand. The retired key `0uT6Cr…` is now rejected outright by the
  function, since it is public in git history.
- **`supabase link` retargets the whole repo.** After linking to prod, every
  `pnpm db:push`, `seed:dev` and `functions deploy` in this working copy points at
  production. `pnpm seed:dev` and `reset_dev_db.sql` now refuse to run unless the
  project looks like dev; nothing else does. Relink to dev the moment prod work
  pauses.
- **Unset ≠ safe.** An unset `*_MOCK` flag selects the *live* adapter.
- **`VITE_*` are build-time.** Changing one requires a rebuild.
- **Docker changes bundling.** With Docker stopped the CLI falls back to
  server-side bundling, which is more permissive than the branch-preview runner.
  A local deploy passing does not prove a preview will.
- **Type-only imports hide from `tsc`.** A dangling `import type` compiles fine
  and fails at bundle time. Seen twice in this codebase.
- **Pre-production migrations are edited in place**, not layered — so a schema
  change means a dev DB reset (`reset_dev_db.sql` → `db:push` → `db:types:all`
  → `seed:dev`). This stops once real tenant data exists; from then on, additive
  only.
- **One late `ALTER` is load-bearing and must stay.** `002600` adds the
  `engagements.scheduling_hold_id` foreign key after the fact because
  `scheduling_holds` does not exist yet at `001300`. That is a genuine forward
  reference, not leftover layering — do not try to fold it.
- **`002800` schedules the cron jobs twice.** It creates them against
  `current_setting(...)`, then unschedules and recreates them against
  `get_supabase_functions_url()` / `get_cron_secret()`. The end state is correct
  on a fresh database and it was left alone deliberately: rewriting cron
  scheduling without a database to verify against is a worse risk than the
  untidiness. Worth flattening later, with a dev reset to prove it.

# Go-live plan — Creative Ballet on opalswift.com

Working companion to the [SPEC §7 checklist](../../SPEC.md#7-v1-production-deployment).
§7 stays canonical for *what* must be true; this doc records **verified current
state**, the **order** to do things in, and **who** can do each step.

**Verified:** 2026-08-05 · `main` @ PR #31

---

## Current state (verified, not assumed)

| | State |
|---|---|
| Code | `tsc` clean · 692 tests / 119 files · CI runs build + lint + test |
| Supabase Preview | ✅ green (fixed in #31 — per-function `deno.json`) |
| Dev DB | Reset, 34 migrations applied, types regenerated, 8 tenants seeded |
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
- [ ] `supabase link` to the new ref, then `pnpm db:push` — the 34-migration
      chain is the source of truth and replays clean (proven on the dev reset).
- [ ] `pnpm db:types:all`
- [ ] SQL editor — cron + encryption config:
      ```sql
      ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<new-ref>.supabase.co';
      ALTER DATABASE postgres SET app.settings.cron_secret = '<matches Edge CRON_SECRET>';
      ALTER DATABASE postgres SET app.encryption_key = '<strong random — never commit>';
      ```
      `app.encryption_key` must be set **before** saving any provider credentials —
      the credential RPCs encrypt with it.
- [ ] Verify `pg_cron` + `pg_net` enabled and `cron.job` lists the scheduled jobs.
- [ ] **RLS spot-check with real data**: a parent sees only their own family; a
      teacher sees only their own tenant. Worth doing by hand — it is the one
      thing no test covers.
- [ ] Provision the Creative Ballet tenant. `provision_tenant` is `service_role`
      only, so call it from the SQL editor with an explicit `p_owner_id`
      (`auth.uid()` is NULL there):
      ```sql
      SELECT provision_tenant('Creative Ballet Academy', 'creativeballet',
                              'professional', 'dance-studio',
                              'owner@…', '<auth.users id>');
      ```
- [ ] Seed invoice sequences; set tenant VAT (`vat_rate` 0.17 עוסק מורשה / 0 עוסק
      פטור, `prices_include_vat`).

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

## Traps worth remembering

- **Unset ≠ safe.** An unset `*_MOCK` flag selects the *live* adapter.
- **`VITE_*` are build-time.** Changing one requires a rebuild.
- **Docker changes bundling.** With Docker stopped the CLI falls back to
  server-side bundling, which is more permissive than the branch-preview runner.
  A local deploy passing does not prove a preview will.
- **Type-only imports hide from `tsc`.** A dangling `import type` compiles fine
  and fails at bundle time. Seen twice in this codebase.
- **Pre-production migrations are edited in place**, not layered — so a schema
  change means a dev DB reset (`reset_dev_db.sql` → `db:push` → `db:types:all`).
  This stops once real tenant data exists; from then on, additive only.

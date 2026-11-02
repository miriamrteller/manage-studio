# lead-email-ingest — inquiry email → CRM lead

Cloudflare Email Worker for phase 2b of the CRM integration. An email sent to
`leads-<subdomain>@opalswift.com` becomes (or refreshes) a row in the `leads`
table, via the `crm-lead-ingest` Supabase edge function — which then SENDS the
studio a "new lead" alert (Reply-To = the inquirer, so answering is one
click). No Email Routing forwarding: forwards need a click-verified
destination per studio, a per-tenant onboarding task the self-onboard rule
bans (docs/plans/crm-lead-capture-channels.md). The worker never bounces a
sender; capture failures are logged only.

```
mum's email → Email Routing CATCH-ALL (opalswift.com MX, already enabled)
            → this worker: leads-<subdomain>@ only, others dropped
            → parse MIME (postal-mime), extract text
            → POST crm-lead-ingest (Bearer CRM_INGEST_SECRET)
                 dedupe on Message-ID → create lead / update open lead
                 → "new lead" alert email to tenants.contact_email
```

**Self-onboard:** the catch-all is bound ONCE, platform-side. From then on
`leads-<any-tenant>@opalswift.com` works the moment the tenant row exists —
no per-tenant routing rules, ever.

Field mapping lives in `supabase/functions/_shared/crm-contract/parse-lead-email.ts`
(tested from apps/web): From → name/email, body regex → phone, subject →
interest, cleaned body snippet → last_communication_note, stage `new`,
channel `email`, `marketing_consent` false (opt-in), `source_ref` = Message-ID.

## Deploy and one-time wiring

Deployed by the GitHub workflow **deploy-lead-email** (owner-approved), never
by hand. It can also set `CRM_INGEST_SECRET` on the worker and prod Supabase in
one run. `CRM_INGEST_URL` in `wrangler.jsonc` is the **prod** function;
`scripts/check-config.mjs` refuses anything else.

Owner steps (catch-all binding, first run, test email):
[docs/deployment/LEAD-EMAIL.md](../../docs/deployment/LEAD-EMAIL.md).

Local build check (uploads nothing):

```bash
pnpm --filter @opalswift/lead-email-ingest exec wrangler deploy --dry-run
```

## Verify

Send a real email to `leads-creativeballet@opalswift.com`, then:

```bash
pnpm --filter @opalswift/lead-email-ingest exec wrangler tail lead-email-ingest
```

and confirm the lead appears in the CRM feed (`crm-contacts`) with
`kind: "lead"`, stage New, channel Email. Re-sending the same message must
not create a second lead (Message-ID dedupe); a second, different email from
the same sender must update the existing open lead's last-contacted fields
instead of creating a duplicate.

## Non-goals (deliberate)

- No HTML sanitisation beyond text extraction — the body only ever becomes a
  truncated plain-text snippet.
- No auto-reply. No rejection. No writes anywhere except the `leads` table
  (enforced server-side: the edge function only touches `leads`).

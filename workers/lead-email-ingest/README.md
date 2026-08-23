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

## One-time wiring

1. **Shared secret** (generate once, give it to both sides):
   ```bash
   openssl rand -base64 32
   ```
   ```bash
   # Supabase side (repo root, linked to the target project):
   npx supabase secrets set CRM_INGEST_SECRET=<value>
   # Worker side (this directory):
   npx wrangler secret put CRM_INGEST_SECRET
   ```
2. **Deploy both sides**:
   ```bash
   # repo root:
   npx supabase functions deploy crm-lead-ingest
   # this directory:
   npm install && npx wrangler deploy
   ```
3. **Bind the catch-all (dashboard — one click, ONCE, platform-wide)**:
   Cloudflare dashboard → opalswift.com → Email → Email Routing →
   Routing rules → **Catch-all address** → Action **Send to a Worker** →
   `lead-email-ingest` → enable. The worker captures only
   `leads-<subdomain>@` and silently drops everything else (same outcome an
   unrouted address had before). Do NOT create per-tenant addresses — the
   whole point is that new tenants need no routing setup.

## Verify

Send a real email to `leads-creativeballet@opalswift.com`, then:

```bash
npx wrangler tail lead-email-ingest
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

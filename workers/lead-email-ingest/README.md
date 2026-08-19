# lead-email-ingest — inquiry email → CRM lead

Cloudflare Email Worker for phase 2b of the CRM integration. An email sent to
`leads-<subdomain>@opalswift.com` becomes (or refreshes) a row in the `leads`
table, via the `crm-lead-ingest` Supabase edge function. The worker never
bounces a sender: capture failures are logged and the optional onward forward
still runs, so a broken ingest can lose a CRM row but never a customer email.

```
mum's email → Email Routing (opalswift.com MX, already enabled)
            → this worker: parse MIME (postal-mime), extract text
            → POST crm-lead-ingest (Bearer CRM_INGEST_SECRET)
                 dedupe on Message-ID → create lead / update open lead
            → optional forward to the studio's real inbox (FORWARD_TO)
```

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
3. **Route the address (dashboard — one click)**: Cloudflare dashboard →
   opalswift.com → Email → Email Routing → Routing rules → Create address →
   `leads-creativeballet@opalswift.com` → Action **Send to a Worker** →
   `lead-email-ingest`. One custom address per tenant, same worker for all —
   the worker reads the tenant subdomain out of the local part.
4. **Optional onward forwarding**: add the studio inbox as a *verified
   destination address* (Email Routing → Destination addresses; the studio
   clicks the confirmation email), then set it as a var:
   ```bash
   npx wrangler deploy --var FORWARD_TO:info@creativeballetacademy.com
   ```
   (or add `FORWARD_TO` to `wrangler.jsonc` vars).

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

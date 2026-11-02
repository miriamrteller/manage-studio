# Leads: where they come from, and the best way

Status: plan only, written 2026-11-02. "Verified" means I checked the code or production read-only. **(confirm)** marks something only the owner can check.

## In short

Most of the plumbing already exists. Every studio already has:
- a public inquiry form
- tagged links for Instagram, WhatsApp and LinkedIn
- a lead email address
- a leads page with stages and follow-up dates
- an email to the studio for each new lead

**What's missing for the beta:**
1. A way to put the form on the studio's **own** website. Embedding is blocked today.
2. Lead email possibly **not reaching production**.
3. Spam protection on the form.
4. A pipeline that fits classes: trial, then enrolled.

Recommended order: fix and confirm email, embeddable form, pipeline + reminders, WhatsApp, Meta lead ads.

---

## 1. How it works today

**The data.** One `leads` table per studio:
- name, email, phone
- what they asked about
- **stage**: new / contacted / qualified / proposal / lost
- **channel**: email / website / whatsapp / linkedin / instagram
- next follow-up date, last contact, note
- marketing consent

Only the studio's admins can see it (RLS). A lead ends when it is **converted** (it becomes a client account) or marked **lost**.

**The ways in:**

| Way in | How | In production? |
|---|---|---|
| Form | `https://<sub>.opalswift.com/inquire` → `crm-lead-capture` | Function deployed (verified) |
| Tagged links | same form with `?src=instagram`, `whatsapp` or `linkedin` | Yes, same form |
| Email | `leads-<sub>@opalswift.com` → Cloudflare Email Routing catch-all → `lead-email-ingest` worker → `crm-lead-ingest` | See below |
| By hand | admin adds a lead on `/admin/leads` | Yes |

**Email ingest in production: needs the owner.**
- The worker `lead-email-ingest` exists in Cloudflare (verified), last changed **2026-08-20**.
- Its committed setting `CRM_INGEST_URL` points to the **dev** Supabase project (`acmujrh…`), not prod (`oogxajj…`). The worker was last deployed before the prod functions were created (2026-08-27).
- **Likely result:** lead emails land in dev, or nowhere. **(confirm)**:
  - the worker's `CRM_INGEST_URL` value
  - whether the Email Routing catch-all is set to "Send to Worker"
  - whether `CRM_INGEST_SECRET` is set on both sides (prod Edge secret and worker secret)

**Form protection today:**
- a hidden honeypot field
- rate limit: 5 per hour per email or IP
- the origin check allows only `*.opalswift.com` and one extra origin (`CRM_CONTACTS_ALLOWED_ORIGIN`, set?) **(confirm)**
- no CAPTCHA

**Consent.** The form shows the marketing opt-in checkboxes (docs/legal 08). Opt-ins are stored in `consent_records`, and the lead row gets a flag. Not pre-ticked. Good as is.

**Notifications.**
- Every new lead (form or email) emails the studio's `contact_email`. This is best-effort and logged.
- Duplicates (same email or message) update the existing lead instead of creating a new one.
- No WhatsApp alert.
- No reminder when a follow-up date passes.

**From lead to customer:**
- **Photographers:** lead → quote → client accepts → contract and shoot. Fully built (`convert_lead_to_job`, `accept_quote`).
- **Dance and other studios: no link.** A parent who asked a question and later enrols becomes a new student. The lead stays open, and we never learn which source brought them.

---

## 2. Gaps

1. **No form on the studio's own site.** `X-Frame-Options: DENY` blocks an iframe, and the origin check blocks a script on another domain (e.g. creativeballetacademy.com).
2. **Email may not reach prod** (above).
3. **No spam protection** beyond a honeypot. Turnstile is ready to use (#165).
4. **Stages fit photographers, not classes.** Missing: trial booked, trial done, enrolled.
5. **No follow-up reminders.** The date is stored, but nothing reminds the studio.
6. **Sources are coarse.** No Facebook, phone, walk-in or referral, and no campaign tag.
7. **No WhatsApp inbound or alerts.** WhatsApp is how Israeli parents usually ask.
8. **No Meta (Facebook/Instagram) lead ads.**

---

## 3. Recommended design

### P1, for the beta

**A. Fix and confirm lead email.** Owner effort: 10 minutes. Cost: free.
- Redeploy the worker with the prod `CRM_INGEST_URL`. Better: set it per environment in the deploy workflow (release lane).
- Bind the catch-all, set the secret, then send one test email.

**B. Hosted form + embed for the studio's own site.** Studio effort: paste one snippet. Cost: free.
- Keep `/inquire`. Add `/embed/inquire`: the same form, no header, and allowed in an iframe (`Content-Security-Policy: frame-ancestors *` on that path only).
- In the leads page's capture panel, add a copy-paste `<iframe>` snippet and a plain "Contact us" link.
- An iframe needs no CORS change and nothing set up per studio.
- Add **Turnstile** to the form, with the server checking the token (same pattern as #163). Keep the honeypot and the rate limit.
- Add an optional `?src=` and `?campaign=` (UTM-style) tag.

**C. A class-studio pipeline.** About 2 days.
- Stages for non-photographers: new → contacted → **trial booked** → **trial done** → **won** / lost.
- Photographers keep their stages.
- "Won" means converted: when someone enrols with the same email or phone, link the lead and mark it won. That gives real conversion by source.
- Add channels: `facebook`, `phone`, `walk_in`, `referral`, `other`. Add a `campaign` text field.

**D. Reminders.** About 1 day.
- A daily email to the studio: "3 leads to follow up today", using the existing scheduled-job pattern.
- An overdue badge on the leads page.

### P2, after the beta

**E. WhatsApp.** Low cost.
- **Now (free):** a click-to-chat link `wa.me/<studio number>?text=…` with a short code (e.g. "Ref L-4821"). The studio logs the chat as a lead in one tap from the leads page.
- **Later (about ₪0.05–0.30 a message):** inbound WhatsApp through Twilio (the project already has `twilio-inbound`). A shared platform number with a studio code, or a paid number per studio. Also new-lead alerts to the studio by WhatsApp.
- WhatsApp Business needs Meta approval per number **(verify)**.

**F. Meta lead ads (Facebook/Instagram).**
- Needs a Meta app, app review, and each studio connecting its Page.
- Leads arrive by webhook and go into the same `leads` table.
- Worth it once studios run paid ads.
- Effort: about 1 week, plus Meta review time.

### Rules for every channel
- **Consent:** contact details are kept only to answer the inquiry. Marketing only with the separate opt-in (docs/legal 08). Keep the opt-in text and version.
- **Spam:** Turnstile + honeypot + rate limit on every public entry point.
- **Studio alert:** email now; WhatsApp in P2.
- **One pipeline view:** every lead in one list with its source, stage, next follow-up and value.

---

## 4. Build order and effort

| # | What | Effort |
|---|---|---|
| 1 | Confirm and fix lead email in prod (owner + one workflow line) | ½ day |
| 2 | Embeddable form + Turnstile + campaign tag | 2 days |
| 3 | Class pipeline stages, auto-link on enrolment, more channels | 2 days |
| 4 | Follow-up reminder email + overdue badge | 1 day |
| 5 | WhatsApp click-to-chat with ref code + one-tap log | 1 day |
| 6 | WhatsApp inbound + alerts (Twilio) | 3–4 days |
| 7 | Meta lead ads | ~1 week + review |

Steps 1–4 are the beta (about 1 week). The default card payment path is not touched by any of this.

## Built

- **P1-A lead email** (#171): the worker points at prod; deploy with
  `deploy-lead-email` ([LEAD-EMAIL.md](../deployment/LEAD-EMAIL.md)).
- **P1-B embeddable form**: `/embed/inquire` on each studio host. It is the same
  form as `/inquire`, without the header. A studio copies the snippet from
  **Settings → Enquiry form on your website** (also on the Leads page).
  - Framing: `public/_headers` drops `X-Frame-Options` and sets
    `frame-ancestors https:` for `/embed/*` only. deploy-web's smoke checks
    that `/` still sends `DENY`.
  - Tags: `?src=` (or `utm_source`) picks the channel; `?campaign=` (or
    `utm_campaign`) is saved on new leads (`leads.campaign`). Tags never imply
    marketing consent; opt-ins are separate, unticked boxes (docs/legal 08).
  - Spam: honeypot + rate limit as before. Turnstile when
    `VITE_TURNSTILE_SITE_KEY` is in the build; `crm-lead-capture` requires a
    valid token whenever `TURNSTILE_SECRET_KEY` is set on Supabase.
  - **Owner check:** the Turnstile widget's hostnames must include
    `opalswift.com` (covers every studio subdomain). If prod has
    `TURNSTILE_SECRET_KEY` but the web build has no site key, the form refuses
    every enquiry, so set both or neither.

## Owner to confirm
- The `lead-email-ingest` worker's `CRM_INGEST_URL` (prod or dev?) and when it was last deployed.
- Cloudflare → opalswift.com → Email Routing: is the catch-all set to "Send to Worker: lead-email-ingest"?
- `CRM_INGEST_SECRET` set on prod Supabase **and** on the worker (same value).
- Is `CRM_CONTACTS_ALLOWED_ORIGIN` set on prod, and to what?
- Each studio's `contact_email` is the inbox that should get new-lead emails.

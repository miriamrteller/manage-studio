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

- **2b questions on the form**: Settings → **Questions on your enquiry form**.
  - **Ready-made questions** for each kind of studio, each switched on or off and
    required or not:
    - Dance/classes: child's name, age, date of birth, class or level of
      interest (from the studio's public classes), previous experience,
      preferred days.
    - Photographers: event type, date, location, budget range.
    - Others: service of interest, preferred date.
  - **Answers the pipeline uses get real columns:** `leads.child_name`,
    `child_birth_date` (for matching a student in step 3), `event_date`, and the
    existing `offering_id` (the class). The convert-to-job panel shows the event
    date and pre-fills the location.
  - **Up to 5 of the studio's own questions** (short or long text, choose one,
    choose several, number), in English and Hebrew, in the order chosen. They are
    stored in `leads.answers` with their labels copied, so old leads still read
    correctly after the studio edits its form. The Settings page shows how many
    questions are on and says shorter forms get more enquiries.
  - **Where answers show:** on the leads page under each lead, with a filter by
    question and answer.
  - **Checks:** the same rules (`packages/shared/src/leadForm.ts`) run in the
    form and in `crm-lead-capture`. A missing required answer or an invalid
    choice (e.g. another studio's class) is refused with `400 invalid_answers`.
  - **Visitors** read questions only through `get_lead_form` (public tier);
    `tenants.lead_form` itself is admin-only.
  - Name, email, phone, message, marketing consent, source tags and Turnstile
    are always on the form and cannot be switched off.

- **2c-i "Get leads"** (Leads page, collapsed once leads exist, and Settings).
  It assumes the studio has **no website**: the hosted form
  (`https://<sub>.opalswift.com/inquire`) is the default way in. It shows:
  1. **Your enquiry form:**
     - the link, with Copy, Open and Share buttons. Share uses the phone's own
       share sheet and appears only where it is supported.
     - a QR code, downloadable as a PNG, and an A4 poster as a PDF with the
       studio's name, logo and colour and "Scan to enquire" in both languages.
       Both are tagged `src=flyer`.
     - a tagged link for WhatsApp, Instagram bio, Facebook, Google Business,
       email, SMS and flyer, each with a one-line how-to. WhatsApp, email and
       SMS also open their composer.
  2. **Send the form to someone** (2c-ii): first name, email and an optional
     phone.
     - **Send by email**: `send-lead-form-link` emails the link
       (`src=direct`) from the studio, with Reply-To the studio's contact email.
       The text comes from fixed templates (`packages/shared/src/leadShare.ts`),
       so the admin types no message.
     - **Limits**: 30 emails an hour per studio, and one per recipient every
       10 minutes. Each send is logged in `audit_log`
       (`leads.form_link_sent`).
     - Sending a link creates no lead and implies no consent; the person
       becomes a lead only by filling in the form.
     - **Send on WhatsApp** opens a chat with that number and the link
       (`wa.me`, free, no WhatsApp API).
  3. **Have your own website?** (collapsed): the embed snippet, plus 3–4 steps
     each for Wix, WordPress, Squarespace and Google Sites. **Email these
     instructions to my web person** sends the code and the steps
     (`leads.web_instructions_sent`, same limits).
  4. **The lead email address**, in one line.
  - **New lead sources:** `facebook`, `google`, `sms`, `flyer` and `direct`
    come from links; `phone`, `walk_in`, `referral` and `other` are for leads
    added by hand. Manual-only sources are never taken from a link. The leads
    page filters by source. The external CRM contract still maps unknown
    sources to "Website".
  - The share, QR and poster parts take a form target (`/inquire` today), so
    named forms (`/f/<slug>`) can reuse them.

- **2d named forms** (Leads → **Forms**, `/admin/leads/forms`). A studio makes
  several forms at `https://<sub>.opalswift.com/f/<slug>`, embeddable at
  `/embed/f/<slug>`. Each form has:
  - an internal name, and a title and intro in en + he;
  - an optional image (uploaded to the studio's `tenant-assets` folder);
  - a subset of the studio's questions;
  - an optional pre-selected class or package;
  - an on/off switch and an optional last day;
  - its own share links, QR, poster and send-by-email (the 2c components,
    given the form).

  `/inquire` stays the general form.
  - **Slugs**: lowercase letters, digits and hyphens, unique per studio,
    reserved words blocked (DB checks + `formSlugProblem`). The editor suggests
    one from the name and checks availability as you type.
  - **Closed**: switched off, or after the last day (Israel time) → "This form
    is closed" with a link to the general form. The last day itself is open.
    `crm-lead-capture` refuses closed or unknown forms (410 / 404).
  - **Leads** record `form_id` (first touch; a deleted form leaves its leads
    with no form). The leads page shows and filters by form, and the forms
    list shows leads and won (converted) per form.
  - **Public read** only through `get_named_lead_form` (public tier); it never
    returns the internal name, and returns no details for closed forms.
    `lead_forms` is admin-only by RLS. Triggers keep a form's class and a
    lead's form inside the same studio.

- **Step 3, class pipeline.**
  - **Stages:** dance and other class studios see new → contacted → **trial
    booked** → **trial done** → **won** / lost. Photographers keep new /
    contacted / qualified / proposal / lost and their lead → quote → job flow,
    unchanged. A lead already in another stage keeps it in its list.
  - **Auto-link on enrolment:** a trigger runs after an enrolment in a **class**
    (`link_lead_on_enrolment`, service tier).
    - It collects the emails and phones of the student, the family's main
      contact and family members. Phones are compared by their last 9 digits,
      so `050…`, `972…` and `+972…` all match.
    - It looks for open leads of the same studio (not won, not lost, not
      converted).
    - **Exactly one** match → the lead becomes **won**, with
      `converted_account_id` (the family), `converted_at` and
      `converted_engagement_id`.
    - **Several** matches → each gets `suggested_engagement_id`, and the leads
      page shows "Possible match: … — Yes, link / Not this one".
    - Any lead can also be linked by hand ("Link to an enrolment" searches
      recent class enrolments).
    - Appointments (photographer jobs) are skipped.
    - The trigger turns its own errors into warnings, so **an enrolment never
      fails because of lead matching**.
  - **CRM contract:** trial booked → "Qualified", trial done → "Proposal",
    won → "Won". The contract itself is unchanged.
  - **Named forms that closed while open in a visitor's browser:** the lead is
    still saved, without the form link or its class. A form that was deleted
    meanwhile → the lead is saved with no required questions.

- **Step 4, daily follow-up digest.** `run-lead-followup-digest` runs daily at
  05:23 UTC (07:23 Israel winter, 08:23 summer), with the same cron pattern and
  `CRON_SECRET` as `run-shoot-emails`.
  - **Recipients:** every studio admin gets one email listing that studio's
    leads due today or overdue. Only open leads count: not won, lost or
    converted. Overdue leads come first and are marked.
  - **No digest** for studios with nothing due.
  - **Language:** en or he, from the admin's language, otherwise the studio
    default.
  - **Sending:** from the studio sender (Reply-To the studio), through
    `sendHtmlEmail`, so `EMAIL_TRANSPORT` applies.
  - **Once a day:** each digest is claimed in `notification_log` before sending.
    A unique index (studio, recipient, `digest_date`) means a retry or
    overlapping run never sends twice; failures are logged.
  - **Opt-out per admin:** Settings → **Daily follow-up email**
    (`lead_digest_optouts`, RLS: own row, own studio). It is on by default.
  - **Leads page:** "Overdue" / "Due today" on each lead, plus a summary line.
  - **Owner:** nothing to set. It uses the existing `CRON_SECRET`,
    `APP_ROOT_DOMAIN` and email transport. It starts the morning after the
    deploy-prod that carries it.

- **Onboarding and help** (final P1 step).
  - **"Get your first leads"** on the Leads page: share your form link, put it
    in your Instagram bio, print your QR poster, send yourself a test enquiry,
    and optionally add it to your website.
    - Steps tick themselves when done in the Get leads panel (Copy link /
      Share, the Instagram link, a QR or poster download, copying the website
      code). The test enquiry ticks itself once the studio has any lead. Any
      step can also be ticked by hand.
    - Progress is kept per studio on the device, like the studio-home setup
      guide, and "Hide this list" hides it for good.
  - **ⓘ help** on every leads setting: Get leads, lead email address, Send the
    form, Website form, Questions, Forms, Daily follow-up email.
  - **"How leads work"** (`/admin/leads/help`, en + he), linked from the Leads
    page and the checklist. Six short sections: where leads come from, your
    form and links, following up, when a lead enrols, the daily reminder, and
    privacy and consent.
  - The studio-home setup guide (Onboarding thread) still links its "leads" row
    to `/admin/leads`; this checklist continues from there. The Get leads
    panel's route and its open/collapsed default are unchanged; it only gained
    `id="get-leads"` so "Show me" can open it.

### Social channels: now and later

- **Now (P1):** tagged links and a QR poster, above. Each lead records where it
  came from.
- **P2:** Meta Lead Ads, i.e. Facebook/Instagram Instant Forms delivered to us
  by webhook, which need a Meta app and app review. Also WhatsApp
  click-to-chat with a reference code.
- **P3:** Instagram DMs as leads, which need Meta app review and an Instagram
  business account.

### Google Forms fallback (no code)

A studio that already uses Google Forms can keep it:
1. In the Google Form: **Responses → ⋮ → Get email notifications for new
   responses**. Google emails the form owner on each response.
2. In Gmail, add a filter on those emails (from `forms-receipts-noreply@google.com`)
   that forwards them to the studio's lead inbox, `leads-<subdomain>@opalswift.com`.
   Gmail asks to confirm the forwarding address once. Its confirmation email
   lands on the Leads page as a lead; the confirmation code is in its subject
   (shown as the lead's interest). Enter it in Gmail, then delete that lead.
3. Each response then appears on the Leads page (channel Email). The answers
   are in the note, not in separate fields. The sender is Google, so the lead
   has no parent email unless the Google Form collects one: ask for it in the
   form, and reply to the address in the note.

Prefer the OpalSwift form when possible: it records consent properly and fills
the fields the pipeline uses.

## Owner to confirm
- The `lead-email-ingest` worker's `CRM_INGEST_URL` (prod or dev?) and when it was last deployed.
- Cloudflare → opalswift.com → Email Routing: is the catch-all set to "Send to Worker: lead-email-ingest"?
- `CRM_INGEST_SECRET` set on prod Supabase **and** on the worker (same value).
- Is `CRM_CONTACTS_ALLOWED_ORIGIN` set on prod, and to what?
- Each studio's `contact_email` is the inbox that should get new-lead emails.

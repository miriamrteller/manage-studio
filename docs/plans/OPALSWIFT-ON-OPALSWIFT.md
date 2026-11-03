# OpalSwift on OpalSwift (dogfooding)

Status: **plan only, no app code.** Written 2026-11-02. "Verified" = I read the code or docs. **(verify)** = not checked.

## In short (phone summary)

- **Yes, do it.** Run the business of selling OpalSwift as a normal studio on OpalSwift, at `hq.opalswift.com`. It is the best test we have, and it costs almost nothing to start.
- **Skin: use "General" (`generic`).** It already has Leads, Clients, quotes and email. No new skin is needed now. Rename the words ("Clients" = studios) in Settings.
- **Leads: the marketing form and self-serve signups should land in HQ's Leads.** Today the contact form only emails hello@ and stores nothing. Fix: make it also post to HQ's lead intake (about 1 day).
- **Clients = studios.** A studio is one client in HQ, with a link to its real studio. Links and notes are quick wins; automatic creation on signup is small work.
- **Billing: later.** Don't charge anyone before you are registered. Use the billing plan; HQ only mirrors it.
- **Decided 2026-11-02:** `hq`, General skin, separate login, auto-create clients, service emails + consented newsletters, WhatsApp later, quotes from first paying studio.
- **Keep HQ separate from you as super admin.** HQ needs its own login (not miriamrteller@gmail.com), so the access log keeps working. See section 6.
- **Biggest gaps:** no "demo booked / trial / paying" stages, no studio link on a client, no support inbox, no newsletter list. All have cheap workarounds.
- **Start now (about 3 days of work):** create HQ, route the contact form, add a studio-sales pipeline. Everything else waits for registration.

---

## Decisions (answered by Miriam, 2026-11-02)

| # | Decision | Answer |
|---|---|---|
| 1 | Subdomain | **`hq`** (check it is not reserved: `is_reserved_subdomain`). |
| 2 | Login that runs HQ | **A separate email**, not miriamrteller@gmail.com (section 6). Address still to be chosen. |
| 3 | Skin | **General** now. Revisit a Software/SaaS skin only if HQ feels wrong after a month. |
| 4 | Auto-create a client in HQ on every self-serve signup | **Yes**, with a link to the studio. Terms and privacy policy must say so before it goes live. |
| 5 | Emails to studio owners | **Service emails to everyone; newsletters only with the separate marketing tick-box.** |
| 6 | WhatsApp | **Later.** Own phone number plus a manual "log this chat" button for now. |
| 7 | Quotes and contracts to studios | **Only from the first paying studio.** Free beta terms until then; no priced quote before registration. |

Next: Phase 1 (section 8) can start. Open item: which separate email runs HQ.

---|---|---|
| 1 | **Subdomain: `hq` or `opalswift`?** | `hq`. Short, can't be confused with the marketing site or `app.`. (Check both are not reserved: `is_reserved_subdomain`.) |
| 2 | **Which login runs HQ?** | A separate email you control (e.g. a second Gmail, or a mailbox like `team@opalswift.com`). Never miriamrteller@gmail.com (section 6). |
| 3 | **Use the General skin, or build a "Software / SaaS" skin?** | General now. Build the SaaS skin only if HQ feels wrong after a month. |
| 4 | **Should every self-serve signup create a client in HQ automatically?** | Yes, once self-signup is on, with a link to the studio. Needs your OK because it copies owner details into HQ. Terms and privacy policy should say so. |
| 5 | **Send product news to studio owners?** | Service emails (welcome, setup help, changes to terms) to everyone. Newsletters only with the separate marketing tick-box. |
| 6 | **WhatsApp for sales and support?** | Later. Start with your own phone number plus a manual "log this chat" button. |
| 7 | **Do you want HQ to issue quotes and contracts to studios?** | Only from the first paying studio. Until then, the free beta terms are enough. |

---

## 1. Which skin fits OpalSwift?

What exists (verified): skins are `photographer`, `beautician`, `dance-studio`, `generic` (table `verticals`). The `generic` skin uses the `services` or `catalog` preset, with Leads, Clients and email.

| Option | Fits? | Verdict |
|---|---|---|
| `dance-studio` | Classes, students, attendance. Wrong. | No |
| `photographer` | Lead → quote → contract → payment → "shoot". The flow is right for selling a plan; the words (Shoot, Package) are wrong. | Possible, but silly words |
| `beautician` | Appointments. Wrong. | No |
| **`generic` (General)** | Leads, Clients, quotes, email. Neutral words. | **Yes** |
| New "Software / SaaS" skin | Pipeline stages, "subscription" instead of "package", link to the studio. | Later, if needed |

**Minimum HQ setup (about 1 hour, no code):**
1. Create the studio with the wizard (`/platform/onboard`): name "OpalSwift HQ", subdomain `hq`, skin General, language English, OpalSwift theme (default).
2. Owner: the separate login from decision 2.
3. Rename words in Settings: Client → "Studio", Offering → "Plan" (prices from the billing plan, once chosen).
4. Add the HQ lead email address `leads-hq@opalswift.com` (already automatic) and share links per channel.
5. Turn on only the features HQ needs; leave attendance, classes, scheduling off (feature flags, `/platform/features`).

HQ should be flagged internal so it never counts as a customer in totals (see section 6).

---

## 2. Leads: where studio-owner enquiries land

Facts (verified): each studio has a lead form (`/inquire`, `/embed/inquire`), email intake, tagged links per channel, ready-made questions plus up to 5 custom, and a follow-up date. Stages today: new, contacted, qualified, proposal, lost. Channels today: email, website, whatsapp, linkedin, instagram. The marketing contact form (`apps/marketing/functions/api/contact.js`) only sends email to hello@opalswift.com via Resend and **stores nothing**.

### How each source gets in

| Source | How | Work |
|---|---|---|
| Marketing contact/beta form | Change the Pages Function to also `POST` to HQ's `crm-lead-capture` (with a server-to-server secret), keep the email as a backup | **Quick win**, ~1 day |
| Self-serve "Create your studio" | When a studio is created, add an HQ lead/client (see section 3) | Small, ~1 day |
| hello@ and leads-hq@ emails | `leads-hq@` works already; forward hello@ into it so each email is a lead | **Quick win**, 1 hour |
| Instagram / LinkedIn / WhatsApp bio links | The tagged links (`?src=instagram`) on `hq.opalswift.com/inquire` | **No work** |
| Referrals (a studio tells a friend) | New channel `referral` plus a "referred by" note | Small, ~½ day |
| Meta lead ads, WhatsApp inbound | Same as the Leads plan P2 | Later |

Reuse the studio Leads plan (docs/plans/LEADS.md): don't build separate machinery for HQ. Because HQ is a normal tenant, every improvement the Leads thread builds (digest, reminders, share links, QR) helps HQ for free.

### Pipeline stages for selling to studios

Wanted: **Enquiry → Demo booked → Trial / beta → Paying** (plus Lost).

The Leads plan adds class stages (new → contacted → trial booked → trial done → won/lost). Those are close, but not the same words. Options:
- **Now (no code):** use the existing stages with a rule: new = enquiry, contacted = demo booked, qualified = in trial/beta, proposal = offered a paid plan; "won" = converted into a client (the studio). Write this rule at the top of HQ's notes.
- **Better (small, ~2 days):** per-tenant stage names, so HQ shows "Enquiry / Demo booked / Trial / Paying / Lost". This also helps every other studio that wants its own words.

Useful fields for studio sales: studio type (dance, photo, beauty), size (number of students or clients), current tool (Excel, Arbox, Lightblue…), country. Use the ≤5 custom questions on HQ's form for these. No schema work.

---

## 3. Clients = studios

A studio that signs up becomes a **client** in HQ, linked to the real studio tenant.

**Quick wins (no code):**
- Create the client by hand, put the studio name, subdomain URL and owner email in the client's details and notes.
- Use notes for every call, WhatsApp chat and request. Tags are not available, so write "[beta]" or "[paying]" at the start of the name or note.

**Small work (about 3–4 days):**
1. **Link to the real studio.** A column on the client (HQ side) holding the studio's `tenant_id` (or subdomain). No cross-tenant read: HQ never sees the studio's private data, only what the owner told us plus facts the platform already records.
2. **Auto-create on signup.** When `create_self_serve_studio` succeeds, a server step (service role) creates or updates the HQ client: studio name, owner email, `signup_source`, plan, status, created date. Marketing consent is copied only if the owner ticked it. Runs as the service role, so it is **not** an access-log "super admin view".
3. **Status mirror.** A daily job copies each studio's `sub_status`, `trial_ends_at` and last-active date onto the HQ client (read-only fields), so HQ's list shows "trial ends in 3 days". It copies facts, not student or client data.
4. **Onboarding checklist.** The studio already has a "Next: finish setup" checklist. Show its progress (e.g. 4 of 7 done) on the HQ client. Until then, a note list is enough.
5. **Support conversations.** There is no inbox today. Quick win: reply from hello@ (Reply-To is already set), and paste the thread into the client's notes. Real work (a conversation log per client, ~1 week) only when there are about 10 studios.

Privacy rule: HQ stores what OpalSwift needs to run the business (owner name, email, studio name, plan, status). It never copies a studio's students, parents or payments.

---

## 4. Billing later

Don't duplicate [opalswift-billing-plan.md](opalswift-billing-plan.md). The mapping:

| Billing plan step | What HQ does |
|---|---|
| P1 free trial, no card | Nothing to bill. HQ shows trial end per studio (section 3, item 3). Manual "mark paid" stays in the super-admin Studios page. |
| After registration: paid terms, receipts | Quote → contract → payment in HQ, using the photographer-style flow already built (quotes #C, contract PDF #G, offline receipts #H). Receipts from the accountant-approved provider (Green Invoice, iCount, Invoice4U), as in BUSINESS-REGISTRATION.md. |
| P2 Grow card capture, auto-billing | The billing plan's `studio_subscriptions` and `platform_payments` are the source of truth. HQ gets a read-only "subscription" box on the client page, so you see paid, past due, next charge without leaving the client. HQ's own Grow account is **not** OpalSwift's platform Grow account: keep the two apart (decision for the accountant). |

Hard rule: no charge, quote with a price, or receipt until OpalSwift is registered (עוסק).

---

## 5. Communications

- **Service emails (welcome, setup help, terms changes):** already sent by the platform with the OpalSwift look and Reply-To hello@. Nothing to build.
- **Onboarding emails from HQ:** the notification blast composer (`docs/plans/archive/notification-blast-composer.md`) already lets a studio email its accounts. Use it from HQ to email "all studios", with a filter by status once the mirror (section 3) exists. **Quick win:** send to a hand-picked list.
- **Newsletters:** only to owners who ticked the separate marketing tick-box (consent records, docs/legal 08). Always include an unsubscribe link. Keep consent date and wording. Check which sender and domain limits apply before the first send (verify Resend plan limits).
- **Announcements about the platform** (outages, price changes, terms): service emails, sent to all studio owners, not newsletters. Terms promise 30 days' notice for fees.
- **WhatsApp:** later. Start with a personal number and a manual "log chat" (Leads plan P2-E).

---

## 6. Privacy: super admin vs. HQ's own data

Verified: the platform access log (`platform_access_log`) records every time the super admin opens or changes data of **any studio other than the super admin's own profile studio**. Service-role, cron and Edge Function writes are never logged. The super admin cannot be a studio user: self-serve refuses an account that already has a profile, and the platform owner has none.

What this means for HQ:
- **Don't make miriamrteller@gmail.com the HQ admin.** If the super admin had HQ as "own studio", viewing it would not be logged, and HQ's studios would see a hole in the story. Use a separate login (decision 2).
- When the super admin opens HQ (to fix something), that **is** logged, and HQ's admin sees it in Settings → Security → OpalSwift access. That is correct and shows we treat HQ like any customer.
- HQ's data (leads, notes, owner emails) is the business's own data; the super-admin Studios page shows only studio facts (status, plan, dates). Keep it that way: no "open HQ's clients" shortcut in the platform view.
- The auto-sync (section 3) runs server-side with the service role. It writes only to HQ and reads only the studio facts above. Document it in the privacy policy ("we keep your studio name, owner email and plan to support you").
- Flag HQ as internal (a `tenants` flag or a name rule) so it is excluded from MRR, trial and conversion totals on the platform page.
- Retention: 24 months for non-financial records, 7 years for financial, as in the legal decisions.

---

## 7. What's missing, and what it costs

**Quick wins (no code or ≤ 1 day):**

| Item | Effort |
|---|---|
| Create HQ with the wizard, rename words, internal-flag convention | 1 hour |
| Forward hello@ into `leads-hq@` | 1 hour |
| Contact-form → HQ lead intake (keep the email as backup) | 1 day |
| Stage-name rule written in HQ notes | 10 minutes |
| Share links + QR for Instagram, LinkedIn, WhatsApp (already built) | 30 minutes |

**Small work (1–4 days each):**

| Item | Effort |
|---|---|
| Per-tenant pipeline stage names (Enquiry / Demo / Trial / Paying) | ~2 days |
| `referral` channel and "referred by" | ~½ day |
| Studio link on a client (`tenant_id`/subdomain) | ~1 day |
| Auto-create HQ client on self-serve signup | ~1 day |
| Daily status mirror (trial end, status, last active) | ~1–2 days |
| Show setup-checklist progress on the client | ~1 day |
| Internal flag excluded from platform totals | ~½ day |

**Bigger work (a week or more):**

| Item | Effort |
|---|---|
| Support conversation log or shared inbox per client | ~1 week |
| "Software / SaaS" skin (words, stages, subscription box) | ~1 week |
| Subscription box and quotes tied to Grow billing | follows billing P2 |
| Newsletter list, unsubscribe and sending history | ~1 week |
| WhatsApp inbound and alerts | 3–4 days (Leads plan) |

---

## 8. Phased plan

**Phase 1: now, during the free beta (about 3–4 days of work, owner ~1 hour)**
- Create HQ (decisions 1–3). Rename words. Turn on only what's needed.
- Contact form feeds HQ's Leads. hello@ forwards to `leads-hq@`.
- Write the stage-name rule; create the first clients by hand (Creative Ballet, the photographer).
- Pick up the Leads thread's work for free (embed form, reminder digest).
- Done when: a stranger fills the marketing form and shows up in HQ's Leads within a minute, and you get the email.

**Phase 2: self-serve is on (about 1 week)**
- Link to studio, auto-create client on signup (decision 4), status mirror, checklist progress, internal flag, `referral` channel.
- Per-tenant stage names.
- Done when: every new studio appears in HQ with its trial end and setup progress, and you never type a studio in by hand.

**Phase 3: after registration and the first paying studios**
- Quotes, contracts and receipts to studios (billing P2). Subscription box on the client.
- Newsletter with consent, announcements from HQ.
- Done when: a studio goes from enquiry to a signed paid plan and a receipt, all inside HQ.

**Phase 4: later (when about 10+ studios)**
- Support conversation log, WhatsApp, optional SaaS skin, Meta lead ads.

Effort total before phase 3: about 2 weeks of development spread over time. Almost all of it also improves the product for other studios.

---

## Verify before building
- That `hq` is free and not reserved.
- Resend sending limits for newsletters and blasts.
- Whether two Grow accounts (OpalSwift's own, and HQ-as-a-studio) are allowed to differ.
- Privacy policy wording for HQ's copy of owner details (lawyer pack).

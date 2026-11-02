# Onboarding audit: can a studio owner get to a first customer alone?

Written 2026-11-02 on `main` @ 2d6bfa2. Screenshots (390px wide) are in `docs/plans/onboarding-audit/`.

> **Status:** leads steps re-checked against main after #177 (updated 2026-11-02). The "studio legal pack" has not merged yet; I will re-run the legal steps when the coordinator says it has.

## How I tested (read this first)

The real local database could not run in this cloud box (Docker image downloads are blocked). So:

| Part | How I saw it | Trust |
| --- | --- | --- |
| Create your studio → wizard → "ready" screen | Real app screens, with a **faked** sign-in and **faked** server answers | Screens and wording are real. Nothing was really created and no email was sent, so the email-confirm step was **read from code, not clicked**. |
| Everything inside a studio (Settings, classes, terms, payments, leads) and the parent enrolment | The browser-only **demo builds** (ballet and photographer) | Screens are real. The data is pre-filled demo data, so **empty states of a brand-new studio were not seen**. |
| opalswift.com, the real emails, Grow/YPay connection, a real payment | Not tested | Needs the real stack. |

Hebrew and English were both walked. Hebrew is mostly good.

---

## Summary (phone-readable)

**Can a studio owner do it alone? Partly. Not yet safe to switch self-signup on.**

The first 5 minutes are good: a short wizard, nothing scary. The problem comes right after it.

**Biggest blockers**

1. **No checklist inside the studio.** After the wizard the owner sees a 5-line list of "next steps". It is plain text, you can't tap it, and it is gone once they press "Go to your studio". The studio's home page is then a dashboard titled "System Setup" full of zeros. They have to guess where to go.
2. **Payments is confusing.** The wizard pre-selects "By card online, through Grow", which most new owners do not have. Settings → Payment shows Stripe-style fields ("Publishable key, Secret key, Webhook secret") even when the studio takes payment at the studio. Invoicing shows "Account ID / API key / Secret" with nothing explained.
3. **A photographer's client has no way to "book".** `/book` says "Appointment booking is not currently available" and the admin page says "not available on your current plan". A photographer's flow is enquiry → quote → accept, but nothing tells the owner that, or how to send a quote.
4. **Legal tab is a long form with 5+ required fields** and legal words (business status, ID number). No example, no "why we ask". (The legal pack is about to change this; re-check after merge.)
5. **Mixed languages and a few Hebrew bugs** (times and ages shown backwards, English words inside Hebrew sentences).

**What works well**

- The wizard: 6 short steps, "Step 3 of 6", a Back button, the address is checked while typing, Hebrew is a proper right-to-left layout.
- The parent enrolment on a phone: 5 steps, a clear "Pay at the studio" confirmation, "Go to my account" link.
- The "Get leads" panel (after #177): one form link, QR code, poster PDF and a tagged link per channel, in plain language and in Hebrew.

---

## Step by step

Times are my estimates for a first-timer who knows what they want (not measured with a real person). Taps count only the main path.

### 1. opalswift.com → "Create your studio"
Not tested. **Read from the handover:** the button (#167) is held as a draft until self-signup is on, so today there is no way in from the website.

### 2. Create your studio (`/create-studio`) · ~1 min · 3 fields + 1 tap
Screen: `01-create-studio-en.png`. "Free during the beta. No card needed." Clear.
- OK: one short form, "Email me a link".
- Last name is optional, first name is not. Fine.
- Not shown: what happens next, how long the email takes, to check spam. (The "check your email" screen was read from code: it names the address it sent to and has "use another email".)
- The button looks greyed-out until everything is filled, with no hint of what is missing.

### 3. Email confirm · ~1–3 min (depends on email) · not clicked
Read from code only. If the link fails the form shows "link failed" and the owner starts again. **Gap:** if the email does not arrive there is no resend and no "check spam" line, only "use another email".

### 4. Setup wizard · ~3 min · ~14 taps, 2 typed fields (name, address)
Screens: `02`–`07-*-wizard0…5` (dance and photographer, English and Hebrew).
- Step 1 Studio: name, language, country. Fine.
- Step 2 Type: 4 clear cards with a one-line example each. Good.
- Step 3 **Payments and documents: the weak spot.**
  - Pre-selects "By card online, through Grow" and "Issued by Grow".
  - 5 card providers, then 9 tax-document providers (Grow, iCount, Invoice4U, YPay, Tranzila, Yesh Invoice, Green Invoice, None). Jargon for someone who has never heard of them.
  - The safest choice for a first-timer ("Pay at the studio") is the **last** card option; "None (not a registered business)" is the last tax option.
- Step 4 Colours: two hex-code boxes. A non-technical owner will not know hex codes. No logo upload here.
- Step 5 Web address: the live check works. The suffix shows `.localhost` in my test; in production it will be `.opalswift.com`. No example of a good address.
- Step 6 Review + the required terms box. Good. "Free during the beta. We'll tell you at least 30 days before any fees start." Reassuring.
- The step counter is clear ("Step 3 of 6 · Payments and documents").
- **Hebrew:** layout mirrors correctly; labels are all translated.

### 5. "Your studio is ready" · ~20 s · 1 tap
Screen: `08-*-wizard6.png`. Shows the studio address and **"Next: finish setup"**, a 5-line numbered list: logo and colours, classes and term, connect payment, legal links, a test enrolment.
- It is plain text. Nothing can be tapped. It disappears when they press "Go to your studio".
- Photographers see "Add classes or services, and the current term". "Term" means nothing to a photographer.
- "Do a test enrolment from start to finish" has no explanation of how.

### 6. Arriving in the studio · ~10 s
Screens: `10-dance-en-admin-home.png`, `10-photo-en-admin-home.png`. Title **"System Setup"**, then "Operations Overview" with Term Enrolments / Outstanding Payments / Admin Review Queue / Revenue MTD (all zero in a new studio). The photographer sees cards (Finance dashboard, Studio settings, Contracts, Billing Accounts).
- **No "finish setup" checklist here**, no progress, no "next step" button.
- "Admin Review Queue" and "MTD" are jargon.
- (The handover mentions a finish-setup checklist; on main I could only find the static list above.)

### 7. Settings (one page, 7 tabs)
Screens: `30-dance-en-settings-00…06`. Tabs: Branding, Studio profile, Language & Region, Payment Settings, Invoicing, Legal, Security.
- On a phone the tab strip scrolls sideways and cuts off names. Easy to miss Legal and Security (`11-dance-en-settings.png`).
- **Branding:** colour hex boxes and a "Font Pair" dropdown. I did **not find a logo upload** on the Branding tab in either demo, though the checklist says "Add the logo". (Please confirm; the demo may hide it.)
- Studio profile: fine. Good note that the subdomain cannot be changed.
- Language & Region: "Phone region: IL" is a free-text box; not obvious.

### 8. Legal tab · ~10–15 min
Screen: `30-dance-en-settings-05-legal.png`. "Legal details: These details fill your privacy policy, enrolment terms and accessibility statement…"
- Required: legal name, business status (dropdown "Choose…"), business address, business phone, and more below.
- Good: "Leave empty if not yet registered" under the ID number.
- Missing: an example, a "why", and a visible "X of Y filled in". Long on a phone.
- **Re-check after the legal pack merges:** auto health declaration/contract, PDF, required acknowledgement.

### 9. Logo and colours
See step 7. Hex boxes plus a swatch. No preview of the studio's pages while choosing.

### 10. Classes, term and prices (dance) · ~10–15 min
Screens: `17-dance-en-terms.png`, `18-dance-en-classes.png`, `19-dance-en-levels.png`.
- The order the owner must discover alone: **Levels → Terms → Classes** (a class needs a term and a level). Nothing says so.
- "Terms" is not explained ("Create and manage terms and other scheduling periods").
- **Bug:** the filter drop-downs on Terms and Classes show the placeholder "Add…" (for example "Status: Add…"). It should read "All".
- The Classes table is wider than a phone: columns are cut off. Price is not visible in the list.
- Parent-facing `/classes` shows empty grey boxes where class photos would go (`21-dance-en-public-classes.png`).
- The Forms page (health declaration, `20-dance-en-waivers.png`): "+ New Consent Template", and the line "Per-class template assignment is available in **V2**" leaks internal wording.

### 10b. Packages and prices (photographer) · partly tested
- I could not clearly find "Packages and prices" from the admin home. `17-photo-en-services.png` ("Bookable Services — not available on your current plan") is a dead end for photographers.
- The Quotes page exists (`20-photo-en-quotes.png`, "Start from a lead"). Clear once you know to look.

### 11. Payments (Pay at the studio, YPay, Grow)
Screens: `13`, `14`, `15`, `30-dance-en-settings-03-payment-settings.png`, `…04-invoicing.png`.
- For a studio with provider **offline** the Payments tab shows "Provider: offline, Secret key: Not configured" and empty **Stripe** fields (Publishable key, Secret key, Webhook secret). Wrong for a studio that takes cash. For the YPay photographer it shows "Provider: ypay, Secret key: Configured" with the same Stripe labels.
- Invoicing: "Provider: none" then Account ID / API key / Secret / Test connection. Nothing explains what to do when you choose "none".
- The Grow/YPay connection screens were **not tested** (need the real stack, and the encryption key is not yet set in prod).
- In Hebrew: "Webhook סוד" and the raw word "offline" are mixed into Hebrew.

### 12. Leads ("Get leads") · ~2 min · checked against main after #177
Screens: `50-dance-en-get-leads-after-177.png`, `50-photo-en-get-leads-after-177.png`, `50-dance-he-get-leads-after-177.png` (earlier, before #177: `16-*-leads.png`).
- Now a "Get leads" panel at the top of the Leads page: "You do not need a website. Share your enquiry form link, and every enquiry lands on this page." Then **Form link** (Copy link, Open form), a **QR code**, "Download QR (PNG)" and "Download poster (PDF)", and one tagged link per place (WhatsApp, Instagram with "Profile → Edit profile → Links", and more). Plain language and a big improvement on the old panel.
- Hebrew is fully translated and mirrored.
- **Inconsistent default:** in the ballet demo the panel is open; in the photographer demo it is **collapsed** under a small "Get leads" arrow, above a table of leads. In a new studio (no leads yet) it should be open by default. Check this on a real empty studio.
- Still missing: a "send this to your first parent/client" sentence, and a link from the finish-setup checklist to this panel (there is no checklist yet, see P1 #1).
- The enquiry form placeholder says "e.g. a birthday party, a trial class for my daughter…" **for a photographer too** (`22-photo-en-inquire.png`).
- Consent boxes are clear and not pre-ticked (good).
- The panel is not on prod yet (next deploy-prod).

### 13. First enrolment as a parent, on a phone · ~2–3 min · ~8 taps
Screens: `40`–`45-dance-parent-*`.
- Works end to end: choose student → class → health declaration → payment → done.
- The step counter changes: "Step 2 of **4**", then "Step 3 of **5**". It looks like a bug.
- The health declaration is in **Hebrew even when the app is in English**, and is titled "(child)" when an adult enrols. The Sign button stays grey until you scroll to the end of the text, with only a small grey hint.
- The "Pay at the studio" confirmation is clear, but the how-to-pay box mixes English and Hebrew in one paragraph.
- A parent who is not logged in was not tested.

For a photographer's client: `/book` is a dead end (`41-photo-parent-start.png`). The real path is enquiry → quote link → accept. Not walked on screen.

### 14. What the owner sees after
Admin home numbers (Term Enrolments etc.) and Families. Not walked after my own test enrolment (the demo resets). **Check later:** does the owner get a "new enrolment" email or notification?

### Hebrew / RTL list
- Class **times and ages are shown backwards**: Mini ballet 16:00–16:40 shows "16:40 – 16:00", ages 3–4 shows "4-3" (`21-dance-he-public-classes.png`). Wrap ranges so they do not reverse.
- English inside Hebrew: "Webhook סוד", "offline", "Health declaration (child)v1".
- Settings tab strip cut off at the edge.
- Class names stay English in Hebrew mode. That is demo data, not a bug.
- The wizard and its review screen are right-to-left and clean.

---

## Prioritised fix list

Effort: S = under half a day, M = 1–2 days, L = more.

### P1: must fix before self-signup goes on

| # | Fix | Effort |
| --- | --- | --- |
| 1 | **Real "Finish setup" checklist on the studio home**, with progress ("2 of 7 done"), tappable rows, hides when complete. Replace the static list on the "ready" screen. Different rows for dance and photographer. | M |
| 2 | **Wizard payments step: default to "Pay at the studio" and "None"**, put them first, hide the 9 tax-document providers behind "I already use an invoicing service". | S |
| 3 | **Payments and Invoicing settings: show only the fields for the chosen provider.** Offline = just the "how to pay" note, no Stripe boxes. | S–M |
| 4 | **Photographer dead ends.** `/book` and "Bookable Services… not on your plan" should say "Send a quote" and link to Quotes. Checklist uses "Packages and prices". | S |
| 5 | **Resend + "check spam" on the check-email screen.** | S |
| 6 | **Plain-English home page for new studios**: replace "System Setup / Operations Overview" and the zeros with a welcome and the checklist. | S |
| 7 | **Legal tab: group the fields, give examples, "X of Y filled in", "why we ask"** (may be solved by the legal pack; re-check). | M |

### P2

| # | Fix | Effort |
| --- | --- | --- |
| 8 | Hebrew bidi: wrap time and age ranges so they read correctly. | S |
| 9 | Filter placeholders "Add…" → "All" on Terms and Classes. | S |
| 10 | Parent enrolment: one step counter, declaration language follows the app language, adults not shown "(child)", clearer "scroll to sign" hint. | S–M |
| 11 | Settings tab strip: wrap or use a select on phones so Legal and Security are visible. | S |
| 12 | Colours: 6 preset swatches before hex; logo upload on the first Branding step (confirm it exists). | M |
| 13 | Classes table on phones: show cards, with price. Explain "Levels → Terms → Classes" (checklist rows link in that order). | M |
| 14 | Replace jargon: "term" (say "season"), "Consent template", "V2", "Admin Review Queue", "MTD". | S |
| 15 | Enquiry form placeholder per studio type (photographer: "a wedding in May…"). | S |
| 16 | Public class page: hide the grey box when there is no photo. | S |

### P3

| # | Fix | Effort |
| --- | --- | --- |
| 17 | Leads: open the "Get leads" panel by default for studios with no leads; add a "send this to your first parent/client" sentence. (QR and poster are done in #177.) | S |
| 18 | Web-address step: show an example ("my-studio → my-studio.opalswift.com"). | S |
| 19 | Greyed-out buttons: say which field is missing. | S |
| 20 | Mixed English in Hebrew payment screens ("offline", "Webhook"). | S |
| 21 | Notify the owner and mark "first enrolment!" when it happens. | M |

---

## Suggestions: progress guide and in-context help

**Progress guide ("3 of 7 done")**
- At the top of the studio home on a phone: a slim bar and the next step as one big button ("Next: add your classes").
- Rows for dance: 1 Logo and colours, 2 Levels, 3 Season, 4 Classes and prices, 5 How parents pay, 6 Legal details (+ pack), 7 Test enrolment.
- Rows for a photographer: 1 Logo and colours, 2 Packages and prices, 3 How clients pay, 4 Contract and legal details, 5 Get leads (share your form), 6 Send your first quote.
- Each row ticks itself from real data (for example "a class exists") and can be skipped. A "Need help? hello@opalswift.com" link at the bottom.
- Stays until every row is done or the owner closes it; reopen from the menu ("Setup guide").

**In-context help**
- A one-line "why" under each field in Legal and Payments (for example "We print this on your privacy policy").
- A "What's this?" link on Terms, Levels and Payment providers that opens a 3-sentence explainer.
- Empty states that say what to do: "No classes yet. Add your first class", with a button.
- A "Try it as a parent" button that opens the studio's `/enrol` in a new tab, instead of "Do a test enrolment".
- Hebrew copy for all of this from day one.

## Still to do in this audit
- Re-run the legal steps once the legal pack has merged (leads panel already re-checked).
- If the real local stack becomes available: confirm the email step, the real empty-studio screens, and Grow/YPay connect.

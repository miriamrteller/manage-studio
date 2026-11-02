# OpalSwift billing plan: how studios sign up and pay us

Status: **plan only, no app code.** Written 2026-11-02, updated the same day with the "After the free beta" roadmap (section 7) and Grow's partner-programme price. Facts marked **(verify)** are not confirmed.

---

## Open questions (read this first)

- **Grow, no-charge card save:** can a card be saved with no charge for a 30-day trial? If not, we need a ₪1 test charge that is refunded.
- **Grow, partner programme:** is it really ₪500 + VAT a month with unlimited studios? How fast is a studio approved, and what does a studio need (registered business only, or more)?
- **Grow, receipts:** under the partner model, who issues receipts to the studio's clients: the studio's own Grow account (expected) or OpalSwift?
- **Grow, foreign cards and currency:** shekel-only appears likely, and tourist cards seem to carry a higher fee (3.5%). Does Grow take foreign cards or USD/EUR at all?
- **Business type:** עוסק פטור or מורשה? It changes VAT (whether the ₪500 + VAT is partly refundable) and the prices we show.
- **Prices:** pick the three monthly prices (suggested ₪79 / ₪149 / ₪299). Break-even on the Grow partner fee is in section 7.
- **Card at signup:** keep it off until Grow billing is live, or ask for it from day 1 (it may cost sign-ups)?
- **Lawyer and accountant:** paid terms, auto-renewal wording, data-retention period, VAT and receipts. Book before charging anyone.

---

## Decisions for Miriam (one page)

**Short version:** build a free trial now (no card). Add card capture and auto-billing only after you are a registered business (עוסק). Ask Grow in writing about the open questions before building anything beyond that.

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Start now with a 30-day trial and no card?** Studios sign up alone, get 30 days of the top plan, then drop to read-only unless you mark them paid by hand. | **Yes.** Needs no registration, no Grow, little code. |
| 2 | **Which business type to register** (עוסק פטור / מורשה / company)? It decides whether you add VAT and what receipts look like. | Ask your accountant. Nothing in the app depends on it yet. |
| 3 | **Prices.** Plan names and limits are in section 3. Market range is in section 3. | You pick. I suggest testing ₪79 / ₪149 / ₪299 per month. |
| 4 | **Card at signup?** The plan says "30 days free, card required". Some studios will drop off at that screen. | Ask for the card only in phase 2. Keep a "no card, trial only" switch so you can turn it off. |
| 5 | **Who is "us" on the receipt?** Grow can issue Hebrew receipts, but only for a registered business. | Do not charge anyone before registration. The terms already say "free during beta". |
| 6 | **Email Grow now** (questions in section 6.2). The two answers decide phase 2 and phase 3. | **Yes, this week.** It costs nothing. |
| 7 | **Lawyer and accountant.** Terms (fees, auto-renewal, cancellation) and receipts. Listed in section 5.3. | Book both before phase 2, not before phase 1. |
| 8 | **Studios opening their own Grow account from inside OpalSwift** (phase 3). You asked Grow: the partner programme is **₪500 + VAT a month, unlimited studios**. I found no public page for it, so this comes from you. | Do it after registration and after about 4–7 paying studios (break-even table in section 7). Until then studios keep using their own accounts or pay offline. |

**What I could not check:** Grow's own documentation sites did not open from my work environment, so Grow facts below come from search snippets and third-party pages. Treat every Grow detail as **(verify)** until Grow confirms it by email.

---

## 1. Signup flow

### What exists today
- **Operator wizard (works):** `/platform/onboard` calls the `provision-studio` Edge Function (migration `20261101133015`). Only the platform owner can use it. It creates the studio and emails the owner an invite.
- **Studio self-signup page (built, off):** `/create-studio` (`CreateStudioPage`, `useCreateStudio`). It is hidden unless `VITE_ENABLE_SELF_SERVE_SIGNUP=true`; otherwise it redirects to `/login`. It makes an auth user, calls `provision_tenant`, and records the terms acceptance. **It will not work even with the flag on:** `provision_tenant` is granted to `service_role` only (migration `20260608002500`), so the browser call fails.
- **Not the same thing:** `/signup` (`SignupPage`, `SignupStep1-3`, `useSignup`) is for a studio's **clients** signing up inside a studio, using email or SMS codes. It is not studio signup.
- **Already in the database:** `tenants.plan` (`essential` / `professional`), `tenants.sub_status` (`trialing`, `active`, `past_due`, `canceled`), `tenants.trial_ends_at`. `get_tenant_features()` already gives trialing studios the professional feature set. `is_reserved_subdomain()` blocks names like `app`, `www`, `billing`, `hello`.
- **Terms:** platform terms, DPA and privacy policy exist as drafts in `docs/legal`. Terms section 3 says "free during the beta" and promises 30 days' notice before fees. Acceptance is stored in `legal_acceptances`.

### What is missing
- A trusted server step that creates the studio after the email is confirmed.
- CAPTCHA, rate limits, and a trial end date set at creation.
- A trial and billing status screen for the studio owner.
- Everything about charging (section 6).

### Proposed screens (English / Hebrew)
1. **Your details.** Email, first name, last name. "Start your 30-day free trial" / "התחילו 30 ימי ניסיון חינם". CAPTCHA below.
2. **Confirm your email.** "We sent a 6-digit code to …" / "שלחנו קוד בן 6 ספרות אל …". Use the existing email code flow.
3. **Your studio.** Studio name, subdomain (live check, shows `name.opalswift.com`), type of studio. "Pick your address" / "בחרו כתובת לסטודיו".
4. **Terms.** Required checkbox: terms and DPA, with links and version. Not pre-ticked. Marketing email is a separate, unticked box.
5. **Card (phase 2 only).** "Add a card. You will not be charged until day 30. Cancel any time before then." / "הוסיפו כרטיס. לא תחויבו לפני יום 30. אפשר לבטל בכל עת." Hosted by Grow, never typed into our page.
6. **Done.** Studio is created, owner lands in their new `name.opalswift.com` admin.

### Safeguards
- **Email verification first, studio second.** Create the studio only after the email is confirmed, from a server function (service role), not from the browser. This also fixes the `provision_tenant` permission problem without handing it to every logged-in user.
- **CAPTCHA:** Supabase Attack Protection supports Cloudflare Turnstile and hCaptcha. Turnstile is free and fits (the project already uses Cloudflare). Source: [Supabase docs](https://supabase.com/docs/guides/auth/auth-captcha). **(verify current settings)**
- **Limits:** one trial per email and per card fingerprint (phase 2). Rate-limit signups per IP. Block disposable email domains (optional).
- **Subdomains:** keep `is_reserved_subdomain()`. Add brand-confusable words you care about (for example `paypal`, `bank`, `grow`). Mirror the list in `resolveTenantSubdomain.ts`, as the migration comment says.
- **Terms:** record version and time in `legal_acceptances` (already built). Terms must be updated before charging (section 5.3).

---

## 2. Trial lifecycle

| Day | What happens |
|---|---|
| 0 | Studio created. `sub_status='trialing'`, `trial_ends_at = now() + 30 days`. Phase 2: Grow hosted page saves the card token. No charge. |
| 23 | Email + in-app banner: "Trial ends in 7 days. You will be charged ₪X on [date]." (Phase 1: "Add payment details or you will go read-only".) |
| 29 | Same email, "tomorrow". |
| 30 | Phase 2: charge the saved token. Success: `active`, receipt emailed. Phase 1: studio goes read-only. |
| Failed charge | Retry on days +3 and +7, email each time. Studio stays usable, banner shown (`past_due`). |
| Day +10 | **Read-only.** Owner can log in, view and export everything. Staff and clients cannot make changes. Public pages show a polite "temporarily unavailable". **Data is never deleted automatically.** |
| Cancel | Owner clicks Cancel in Settings. Access continues to the end of the paid period (matches terms section 10). Then read-only. Data kept for a stated period (lawyer decides), then deleted only after notice. |
| Reactivate | Owner adds a card or pays, studio is live again immediately. |

Notes:
- The monthly run is a daily scheduled job, same pattern as the existing `run-monthly-billing` and `run-enrolment-payment-dunning` functions.
- Charge once per period with a stable key (tenant + period) so a double run cannot charge twice.
- Israeli law on auto-renewing consumer contracts is relevant even for business customers if any studio is a sole trader. Lawyer to confirm reminder timing and cancellation wording **(verify)**.

---

## 3. Plans and limits

Both plans already exist in the code (`essential`, `professional`). I suggest a third, so you have something to grow into. Features below follow the existing `feature_definitions` tiers; limits are new.

| | **Starter** (`essential`) | **Studio** (`professional`) | **Pro / multi-site** (new, optional) |
|---|---|---|---|
| For | Solo teacher, photographer, tutor | Dance studio, gym, school with staff | Several locations or heavy use |
| Active clients | up to ~100 | up to ~500 | unlimited |
| Staff logins | 1–2 | up to ~10 | unlimited |
| Features | Classes, bookings, payments, receipts | + families, programs, waivers, reports | + custom domain, priority support |
| Messaging (SMS/WhatsApp) | pay as you go | included allowance | larger allowance |

Limits are proposals. Choose them by what actually costs you money: SMS/WhatsApp messages and support time, not database rows.

**Prices are your decision.** Market evidence found:
- **Arbox** (Israeli gym and studio software): third-party listings show about **$39–$299 per month** across four plans, with a free tier for very small use. Sources: [Capterra](https://www.capterra.com/p/184438/Arbox/pricing/) (Basic $49, Standard $129, Professional $299), [Zoftwarehub](https://zoftwarehub.com/products/arbox/pricing) (about $39 / $99 / $239). These are USD, third-party, possibly stale. **(verify on arbox.com)**
- In shekels, that is roughly **₪150–₪1,100 per month** at today's rates **(my conversion, check the rate)**. Your product is simpler, so a lower start is reasonable. My suggestion: Starter ₪79, Studio ₪149, Pro ₪299 per month, with about 2 months free on yearly. Test with 5–10 real studios before fixing prices.
- Also check: Green Invoice, Fitness/Boostapp-type tools, and what your first studios pay today.
- Decide whether prices include VAT (depends on your registration type).

---

## 4. Owner's platform view

A new page next to `/platform/onboard` and `/platform/features` (super-admin only, already protected by `SuperAdminRoute`):

- **Studios list:** name, subdomain, plan, status (trialing / active / past due / read-only / canceled), trial end date, last payment, next charge, owner email.
- **Filters:** "trial ends within 7 days", "payment failed".
- **Actions per studio** (each writes a line to an audit log, using the existing `platform_access_log` pattern from `20261101140810`):
  - Extend trial (+7 / +14 / custom days).
  - Mark paid manually (amount, date, method, receipt number you issued). Needed in phase 1 and for bank-transfer customers.
  - Change plan.
  - Cancel / reactivate.
  - Set read-only now (abuse or non-payment).
- **Totals at the top:** active paying studios, monthly recurring revenue, trials in progress, trials converted in the last 30 days.
- Viewing a studio's private data stays gated by the existing access-log rules.

---

## 5. Data model, integration, security, professionals

### 5.1 Data model (sketch)
New table `studio_subscriptions`, one row per studio (platform-owned, no studio access):
`tenant_id` (unique), `plan`, `status`, `trial_started_at`, `trial_ends_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `billing_provider` (`manual` / `grow`), `provider_customer_ref`, `price_ils_agorot`, `next_charge_at`, `failed_attempts`, `last_failure_reason`, `readonly_since`.

New table `platform_payments`: `id`, `tenant_id`, `amount`, `currency`, `status`, `provider_ref` (unique, for idempotency), `period`, `receipt_ref`, `paid_at`, `method` (`card` / `bank` / `manual`), `created_by`.

New table `platform_payment_methods`: `tenant_id`, `provider`, `token` (encrypted, same approach as existing per-studio tokens), `card_brand`, `last4`, `expiry`, `revoked_at`.

Keep `tenants.plan` and `tenants.sub_status` as the fields the app reads. A trigger or the scheduled job keeps them in step with `studio_subscriptions`. Add a `readonly` value to `sub_status`, or derive it. Read-only needs a check in the write policies (RLS) or at the API layer, and tests.

Feature flags: the existing `get_tenant_features()` already handles the trial. Plan limits (client count, staff count) are new checks, ideally soft first (warn, then block new adds).

### 5.2 Functions and webhooks
- `signup-studio` (new, public, CAPTCHA-checked): after email confirmation, create studio with `trialing` + `trial_ends_at`, write subscription row, record terms acceptance.
- `billing-start-card` (phase 2): creates a Grow hosted payment page that only saves the card.
- `grow-platform-webhook` (phase 2): receives Grow's notify call, saves the token and payment record. Must verify the call (see below). **Use a separate endpoint and separate platform credentials** from the per-studio Grow code.
- `run-platform-billing` (scheduled daily): sends reminders, charges due studios, retries, flips to read-only.
- `platform-admin` actions (extend, mark paid, cancel): super-admin only, audit logged.

What the repo already does that we can copy: the Grow provider calls `createPaymentProcess`, `createTransactionWithToken` and `approveTransaction`, stores a card token from the first notify (`persistCardToken`), and has monthly billing and dunning jobs. All of that is for a **studio charging its clients with the studio's own Grow credentials**. OpalSwift charging studios is a second, separate use: new credentials in Edge secrets (the `.env.example` already notes "Grow platform (Edge, NOT tenant merchant keys)"), new tables, and a new webhook. Do not mix them.

### 5.3 Security notes
- Card numbers never touch our servers or database. Use Grow's hosted page; store only the token.
- Tokens encrypted at rest, never returned to the browser, no tokens in logs.
- Webhook: Grow's notify does not appear to use a signature **(verify)**. Treat the notify as a hint only: after receiving it, call Grow's API to confirm the transaction, as the existing code does with `approveTransaction`. Match amount and our own reference.
- Idempotency: unique `provider_ref` and unique (tenant, period).
- Super-admin actions logged; extending a trial or marking paid should be visible in an audit list.
- Signup abuse: CAPTCHA, rate limit, one trial per email/card.
- Platform Grow credentials are different from studio credentials and live only in Edge secrets.

### 5.4 Needs a lawyer or accountant
- **Accountant:** business type (עוסק פטור/מורשה/company), VAT on subscriptions, receipt vs tax invoice, whether Grow issues receipts in your name, foreign-studio rules (Israel-only for now), bookkeeping.
- **Lawyer:** paid terms (auto-renewal, price changes, cancellation, refunds, 30-day trial wording, read-only and data-retention period), consumer-protection rules if any studio is a sole trader, privacy policy update for card tokens and billing data, DPA changes, liability limit now tied to fees paid.
- Update `docs/legal/01-platform-terms` section 3 from "free during the beta" to the real fee terms before phase 2.

---

## 6. Research: Grow

Why this section is thin: Grow's developer sites (`developers.grow.business`, `grow-il.readme.io`) could not be opened from my environment. Findings come from search snippets and third-party pages. **Everything here is "verify with Grow".**

### 6.1 Can Grow do trial + card + auto-billing?
- **Recurring and tokens: probably yes.** Grow's API reference describes recurring payments in two modes: *managed by Grow* (Grow charges the customer every month for a set amount and number of charges) or *managed by you* (you charge a saved token yourself). Source: [Grow reference: Recurring Payment](https://grow-il.readme.io/reference/create-payment-process-3).
- **Token charges:** `createTransactionWithToken` charges a saved token. Payment types listed: direct debit/recurring, regular, installments (1–12). Source: [Grow reference: Create Transaction With Token](https://developers.grow.business/reference/create-transaction-with-token-4). The two Grow doc pages disagree on what type code 1 means **(verify)**. The page also says working with tokens needs permission from Grow, tokens can be saved for up to 180 payments, and that on a final decline (expired/stolen card) you should stop charging and ask for a new card.
- **Delayed first charge (trial):** the best-fit design is "managed by you": capture the token at signup (no or minimal charge), then charge it at day 30 from our scheduled job. This is the same pattern as the existing monthly billing code. Whether Grow can save a card **without** any charge (₪0 or ₪1 authorisation) is **not confirmed (verify)**. This is the most important question for phase 2.
- **Webhooks:** Grow calls a notify URL after payments (already used in this repo, `GROW_NOTIFY_URL`). Details for recurring events **(verify)**.
- **Hebrew receipts:** Grow bundles tax documents (the app's `invoicing_provider='grow'` setup assumes this), and Green Invoice's help centre describes Grow collecting the fees. Whether receipts issued for OpalSwift's own charges come out in Hebrew under your business name is expected but **(verify)**, and needs a registered business.
- **Fees:** one partner page (Green Invoice) lists **1.4%** processing for monthly volume ₪1–5,000 for new terminals, no terminal setup fee, **₪16.9** per bank transfer under ₪5,000 and **0.3%** extra for Bit; prices exclude VAT. Source: [Green Invoice, clearing](https://www.greeninvoice.co.il/market/clearing). That is a reseller's page, may be out of date, and is not Grow's own price list. Another comparison site shows 0.75% for Meshulam, unreliable. **Fee for your case: ask Grow for a written quote, including monthly fees and recurring/token fees.**
- **Who can open an account:** needs a registered business **(verify)**.

### 6.2 Can a studio open its own Grow account from inside OpalSwift (phase 3)?
**Update from the owner (asked Grow directly):** Grow has a partner programme at a flat **₪500 + VAT per month**, unlimited clients (studios). It starts only once OpalSwift is a registered business. I found **no public page** for this programme or an onboarding API; my searches showed only the standard developer docs and plugins on Wix and Duda, which let a merchant connect an existing Grow account. So treat the programme's terms, speed and API as unconfirmed until Grow answers in writing (questions below).

**Where studios are today:** Creative Ballet takes payment at the studio (cash/offline). The photographer uses YPay on her own account. Neither needs the partner programme yet.

**Questions for Grow (refreshed; support or sales, in Hebrew):**
1. Partner programme: is it ₪500 + VAT a month with no cap on studios? Any contract length, set-up fee, or per-studio fee? Is there an API, or a form we submit for each studio?
2. Onboarding: what does a studio need (registered business only?), what does OpalSwift collect for it, and how fast is approval: same day, or days?
3. Receipts: under the partner model, who issues receipts and tax documents to the studio's clients: the studio's own Grow account, or OpalSwift?
4. Trial: can a card be saved **with no charge** (for a 30-day trial)? If not, is a ₪1 charge plus refund allowed? What are the fees for token and recurring charges?
5. **International cards and currency:** does Grow accept foreign-issued cards, at what fee, and can it charge or settle in USD/EUR? (Needed for studios with overseas clients, and for OpalSwift billing a non-Israeli studio.)
6. Fees for our own subscription charges (OpalSwift's Grow merchant account): processing rate, any monthly fee.
7. Technical: is there a notify signature, and which events fire for recurring charges?

**Alternatives if the partner programme does not work out:**
- **Referral link only:** a "Open a Grow account" button that opens Grow's own signup with a partner code, then the studio pastes keys back. Slow (not "almost immediately") but low effort.
- **Other Israeli providers** (PayMe, Tranzila, YPay, iCount, Invoice4U): the app already has code for several of these as payment options. PayMe is known for a platform/marketplace product **(verify, I did not confirm it from a primary source)**. Ask each the same questions.
- **Stripe:** the owner's understanding is that Stripe is not available to Israeli businesses. Public sources conflict (a 2026 vendor guide says some can onboard locally; an older one says no, [Zenind](https://www.zenind.com/help/post/how-to-open-a-stripe-account-in-israel-a-founder-s-guide), [Osome](https://osome.com/uk/blog/stripe-account-israel-osome-uk-incorp)). Not a dependency of this plan; only worth a recheck if Grow cannot do foreign cards.

### 6.3 International cards and foreign currency (new)
Method: search snippets only, as Grow's own sites were blocked. **All of this is unconfirmed until Grow answers.**
- **Currency looks shekel-only.** Green Invoice's pages on Grow's digital payments say clearing is "in shekels only" (שירות תשלומים דיגיטליים מאפשר סליקה בשקלים בלבד), and Wix's Grow help page lists the New Israeli Shekel as the only currency. Sources: [Green Invoice, Grow/Meshulam](https://www.greeninvoice.co.il/market/clearing/meshulam), [Wix help (Hebrew)](https://support.wix.com/he/article/%D7%97%D7%99%D7%91%D7%95%D7%A8-grow-%D7%A9%D7%9C-%D7%9E%D7%A9%D7%95%D7%9C%D7%9D-%D7%9B%D7%97%D7%91%D7%A8%D7%AA-%D7%A1%D7%9C%D7%99%D7%A7%D7%94). Wix also lists Israel as the only supported country for Grow ([Wix help (English)](https://support.wix.com/en/article/connecting-meshulam-as-a-payment-provider)).
- **Foreign ("tourist") cards: possibly yes, in shekels, with a higher fee.** A Green Invoice page lists a "tourist card" clearing fee of **3.5%**. This is a reseller page, not Grow's price list, and does not say the cards work for recurring or online charges.
- **No evidence either way** on foreign-currency settlement (USD/EUR) or on charging a foreign-issued card via saved token.
- **What this means:** a studio's overseas client could probably pay in shekels (their bank converts), but OpalSwift billing a non-Israeli studio in USD/EUR is unlikely to work on Grow. For the first studios (all Israeli, ILS) this does not matter. Ask question 5 above; if the answer is no, the fallback for foreign studios is bank transfer or PayPal-style invoicing, handled by hand.

---

## 7. After the free beta: roadmap

**Now (during the free beta):** build **Phase 1** below, the 30-day trial with no card. It is the immediate next build and needs no registration, no Grow, and no money moving.

**Once OpalSwift registers as a business, in this order:**

| Step | What | Needs first | Cost | Effort |
|---|---|---|---|---|
| 1 | **Register the business** (עוסק פטור / מורשה / company). Follow `docs/legal/BUSINESS-REGISTRATION.md` (being written by the legal thread; not duplicated here). Then fill the placeholders in the terms and update them from "free during beta" to real fee terms. | Accountant decides the type. | Accountant fee **(unknown)**; registration itself is usually free or low **(verify)**. | Days to a few weeks, mostly waiting on authorities. |
| 2 | **Open OpalSwift's own Grow merchant account** for its subscriptions. Ask the Grow questions 4, 6 and 7 (section 6.2) first. | Step 1 done. | Processing about 1.4–1.5% per charge (reseller figures, **verify**), plus any monthly fee **(ask)**. | About 1 week to open; **Phase 2** build is about 2–3 weeks of development. |
| 3 | **Turn on Phase 2:** card capture at signup, auto-billing at day 30, receipts, dunning. Start with 3–5 friendly studios. | Step 2, updated terms, Grow's no-charge card answer. | Same as step 2. | See Phase 2 below. |
| 4 | **Join the Grow partner programme** so studios can open their own Grow account from inside OpalSwift (**Phase 3**). | Step 1 done; Grow confirms terms and onboarding in writing; enough paying studios (below). | **₪500 + VAT a month**, flat, unlimited studios (from the owner's call with Grow; not on a public page). | Depends on Grow's process; build about 2–4 weeks once the process is known **(estimate)**. |

Effort figures are rough guesses for planning, not commitments.

### Break-even on the Grow partner fee
The fee is ₪500 + VAT per month. VAT in Israel is currently 18% **(verify)**, so about **₪590 a month**. If OpalSwift is a VAT-registered dealer (עוסק מורשה) the VAT is normally refundable, so the real cost is ₪500. If OpalSwift is exempt (עוסק פטור), the VAT is a real cost and OpalSwift also charges no VAT. **Ask the accountant.**

Paying studios needed to cover the fee, by monthly price (ex-VAT; processing fees on OpalSwift's own charges ignored, they are small):

| Price per studio / month | Studios to cover ₪500 | Studios to cover ₪590 |
|---|---|---|
| ₪79 | 7 | 8 |
| ₪149 | 4 | 4 |
| ₪299 | 2 | 2 |

This only counts the partner fee. It is a good reason to join the programme **after** you have about 5–8 paying studios, not before. If most studios use the cheapest plan, aim for 8.

### Build phases

### P1: free trial, no card (before registration)
**Goal:** studios can sign themselves up. Nothing is charged.
- `signup-studio` function, screens 1–4 and 6, CAPTCHA, email confirmation, terms acceptance.
- `studio_subscriptions` table, trial end date, reminder emails (day 23, 29), read-only after expiry.
- Platform page: list, extend trial, mark paid (manual, bank transfer), cancel.
- Terms stay "free during beta"; wording about trial and read-only reviewed by a lawyer lightly.
- **Done when:** a stranger can sign up, use the studio for 30 days, get reminders, and go read-only; you can extend or mark paid.
- **Blocks nothing on registration.** Do not collect money by hand until you are registered.

### P2: Grow card capture and auto-billing (after registration)
**Needs first:** registered business, accountant answers, Grow written answers (6.2 questions 4–6), updated paid terms.
- Screen 5, `billing-start-card`, platform webhook, `run-platform-billing`, receipts, dunning, `platform_payments`.
- Feature switch "require card at signup" (off = P1 behaviour).
- Start with 3–5 friendly studios in Grow sandbox, then live with one real charge.
- **Done when:** a test studio goes from signup to automatic charge at day 30 and receives a Hebrew receipt, and a failed charge leads to read-only without data loss.

### P3: studios open their own Grow account (Grow partner programme)
- Only after registration and written confirmation from Grow of the programme terms (₪500 + VAT a month, unlimited studios, per the owner). If Grow's process turns out to be manual, fall back to a referral link plus the current paste-your-keys flow.
- Shape if allowed: a "Start accepting cards" step in studio settings that pre-fills the application and tracks its status.
- Needs each studio to be a registered business; show this clearly and offer manual payment (bank transfer, Bit, cash) until they are.
- **Done when:** a new studio can take its first card payment within a day of applying.

---

*Sources are listed inline. Items marked (verify) must be confirmed with Grow, an accountant or a lawyer before building on them. Grow facts come from search snippets and third-party pages (Grow's own sites were blocked), and from the owner's call with Grow for the partner programme.*

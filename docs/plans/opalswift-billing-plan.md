# OpalSwift billing plan: how studios sign up and pay us

> **Prices decided 2026-11-11 (owner):** two plans, no add-ons. **Project ₪129 a month** (job-based work: photographers, designers, tradespeople) and **Studio ₪199 a month** (class-based studios). Trial: 1 month. Founders free until the end of 2026 (owner decision, see [TAKBULL-INTEGRATION.md](TAKBULL-INTEGRATION.md)). The founder half-price offer is **not** confirmed. These are **introductory prices**. OpalSwift is an exempt dealer (עוסק פטור) for now, so no VAT is charged and the studio pays the listed price. Once OpalSwift becomes a licensed dealer (עוסק מורשה), the prices become **Project ₪149 and Studio ₪229 a month, VAT included** (owner, 2026-11-11) [[ACCOUNTANT: confirm]]. Where this file still suggests ₪79, ₪99, ₪149, ₪169 or a third ₪299 plan, those were earlier suggestions and are replaced by these prices.

> **Updated 2026-11-10:** OpalSwift bills studios through its own **Takbull** account, not Grow. How the card, monthly charge and receipts work is now in [TAKBULL-INTEGRATION.md](TAKBULL-INTEGRATION.md#opalswifts-own-billing-of-studios-owner-decision-plan-2026-11-10-not-built-yet). The Grow research below (sections 6 and 7) is kept only for history; the prices, costs and market sections still stand.

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

## Headline numbers (details in sections 8 and 9)

Exchange rate assumed: **$1 = ₪3.7** (my assumption, check). All ₪ are before VAT unless stated.

- **Running cost today (beta, no business yet):** about **₪150 a month** for the platform (Supabase Pro, Cloudflare, domain). Add your Claude plan: **₪75** (Pro $20) to **₪740** (Max 20x $200).
- **After registration (expected):** about **₪1,600 a month** fixed, including the Grow partner fee (₪590 with VAT), accountant, insurance and a Claude Max plan. Without the Grow partner fee: about **₪1,000**.
- **Per studio, variable cost:** about **₪30 a month** (mostly SMS/WhatsApp), ₪10 low, ₪60 high.
- **Break-even studios** (expected fixed cost incl. Grow partner fee): **32 at ₪79, 14 at ₪149, 6 at ₪299.** Without the Grow partner fee: 20 / 9 / 4.
- **Minimum price that is healthy:** about **₪99 a month** for the cheapest plan. ₪79 only works as a founding-member or promo price.
- **Decided introductory plans (2026-11-11):** **Project ₪129, Studio ₪199** per month (₪149 / ₪229 VAT included once a licensed dealer), no add-ons. (Earlier suggestion was Solo ₪99, Studio ₪169, Pro ₪299 with a 12-month founder price lock; replaced.)
- **Market:** small-studio tools cost roughly **$16–$250 a month** (₪60–₪925). Israeli Arbox lists higher ($39–$299). All third-party figures, see section 8.

---

## Decisions for Miriam (one page)

**Short version:** build a free trial now (no card). Add card capture and auto-billing only after you are a registered business (עוסק). Ask Grow in writing about the open questions before building anything beyond that.

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Start now with a 30-day trial and no card?** Studios sign up alone, get 30 days of the top plan, then drop to read-only unless you mark them paid by hand. | **Yes.** Needs no registration, no Grow, little code. |
| 2 | **Which business type to register** (עוסק פטור / מורשה / company)? It decides whether you add VAT and what receipts look like. | Ask your accountant. Nothing in the app depends on it yet. |
| 3 | **Prices.** Plan names and limits are in section 3. Market range and my recommendation are in section 8. | **Decided 2026-11-11:** Project ₪129, Studio ₪199 per month. |
| 4 | **Card at signup?** The plan says "30 days free, card required". Some studios will drop off at that screen. | Ask for the card only in phase 2. Keep a "no card, trial only" switch so you can turn it off. |
| 5 | **Who is "us" on the receipt?** Grow can issue Hebrew receipts, but only for a registered business. | Do not charge anyone before registration. The terms already say "free during beta". |
| 6 | **Email Grow now** (questions in section 6.2). The two answers decide phase 2 and phase 3. | **Yes, this week.** It costs nothing. |
| 7 | **Lawyer and accountant.** Terms (fees, auto-renewal, cancellation) and receipts. Listed in section 5.3. | Book both before phase 2, not before phase 1. |
| 8 | **Studios opening their own Grow account from inside OpalSwift** (phase 3). You asked Grow: the partner programme is **₪500 + VAT a month, unlimited studios**. I found no public page for it, so this comes from you. | Do it after registration and after about 4–7 paying studios (break-even table in section 7). Until then studios keep using their own accounts or pay offline. |

| 9 | **Founding-member offer for beta studios.** Locked price (for example 12 months at the Solo/Studio price you set, or 30–50% off) in return for feedback and a testimonial. | Yes: **locked price for 12 months, then the normal price.** Needs a lawyer to word the price lock in the terms. |
| 10 | **Annual discount.** | **2 months free** (about 17% off) when paid yearly. Only once card billing exists (phase 2). |
| 11 | **Which Claude plan for development?** It is the biggest single cost after Grow (₪75 to ₪740 a month). | Your call. Max 5x ($100) while building heavily; drop to Pro ($20) when quiet. |
| 12 | **Join the Grow partner programme at once, or wait for about 8–14 paying studios?** | Wait. It costs ₪590 a month with VAT, more than all other platform costs combined. |

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
- In shekels, that is roughly **₪150–₪1,100 per month** at today's rates **(my conversion, check the rate)**. Your product is simpler, so a lower start is reasonable. Decided 2026-11-11: Project ₪129 and Studio ₪199 per month (see the note at the top).
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

## 8. Pricing and plans

### 8.1 What OpalSwift has today (from the repo)
"Flag" = a feature flag in `feature_definitions` (migration `20260608002500`); tier is `essential` (both plans) or `professional` (professional only). Verticals today: `dance-studio`, `photographer`, `beautician`, `generic`. The signup wizard also lists music, martial arts, fitness, yoga and tutoring as studio types.

**Classes, people and scheduling**
- Classes, levels, terms and sessions; attendance. (Flag `offerings:structure.configure`, professional.)
- Public self-service booking pages. (`offerings:booking.public`, professional.)
- Families and account relationships. (`people:families.manage`, professional.)
- Appointment scheduling with Cal.com. (`scheduling:appointments.calcom`, essential.) Cal.com "Atoms", no-show and late-cancellation fees, and an AI scheduling assistant are flagged professional; the AI assistant has no code behind it yet (verify).
- Google Calendar connect and sync.
- Enrolment: guest enrolment, saved progress, intake, admin-sent enrolment and waiver links, teachers and students.

**Money**
- Payment providers in code: Grow, YPay, Tranzila, iCount, Invoice4U, Stripe, plus offline/manual payment with instructions. Mock providers for testing.
- Invoicing and receipts through the provider (Grow, iCount, Invoice4U, YPay, Tranzila, Green Invoice, Yesh).
- Monthly billing and renewals (`run-monthly-billing`), standing orders (flag `billing:recurring.enabled`, professional), failed-payment handling and dunning (`billing:dunning.enabled`, professional).
- Refunds, payment documents emailed to clients, missing-document checks, failed-document queue (professional).
- Expenses with categories (essential); advanced expenses with VAT recovery, real-time profit and loss, annual accountant report, עוסק פטור to מורשה threshold radar, BKMVDATA export (all professional).

**Photographers (and similar freelancers)**
- Quotes with accept link; job contracts with PDF and signing; job payment requests and reminders (`job-payment-request-public`, `run-job-payment-reminders`); shoot emails.
- Payment-gated file/gallery delivery, public portfolio, extended storage (flags, essential, photographer only). The full gallery screen was not found in the code; the flags exist (verify).
- CRM: lead capture and ingest, contacts.

**Forms and legal**
- Waivers and health declarations with evidence and reminders; consent records; marketing opt-in and unsubscribe; terms and DPA acceptance.
- Studio-level legal links and legal profile.

**Messaging**
- Email notifications and payment reminders (essential). WhatsApp OTP, WhatsApp reminders and documents, and voice reminders are flagged professional. SMS/WhatsApp go through Twilio and are not live yet (Twilio keys are commented out in `.env.example`; verify).

**Platform, branding and security**
- Hebrew and English (right-to-left), studio colours, logo and theme; custom domain (`platform:domains.custom`, professional); branded PDFs.
- Admin two-step sign-in option (MFA), platform access log, security hardening, nightly encrypted backups to Cloudflare R2.
- Not built yet: studio-facing subscription billing, plan limits, AI content tools (flag only).

### 8.2 Market research
Method: web search snippets and comparison pages, 2 Nov 2026. Vendor pages were not opened, so every price is third-party and **uncertain**. Currency as quoted; ₪ at $1 = ₪3.7.

**Studio and gym software**

| Product | Price per month | What tiers gate | Trial |
|---|---|---|---|
| **Arbox** (Israel) | ~$39–$299 across 4 plans (Capterra: $49 / $129 / $299; Zoftwarehub: ~$39 / $99 / $239, as of Aug 2025). Free tier for very small use. About ₪145–₪1,100. | Number of sessions/clients, payments, invoicing, automation | Free trial listed; length not confirmed |
| **Mindbody** (US) | From $79 per location (Mindbody blog, Jul 2026); add-ons can add $200–$400 | Features and add-ons by tier | Not confirmed |
| **Glofox** | ~$80–$110 entry, quote-based, annual contracts (estimates differ) | Members, branded app, payments | Not confirmed |
| **Momence** | Free / $60 / $199 reported; small studios report $199–$250; AI add-on $399 | Platform fee falls at higher tiers | Not confirmed |

Sources: [Capterra, Arbox](https://www.capterra.com/p/184438/Arbox/pricing/), [Zoftwarehub, Arbox](https://zoftwarehub.com/products/arbox/pricing), [Koalendar, Mindbody pricing](https://koalendar.com/blog/mindbody-pricing-costs), [Studio Growth, Mindbody vs Glofox](https://studiogrowth.com/mindbody-glofox/), [Vibefam, Momence review](https://vibefam.com/momence-review-pricing-features-pros-cons-2026/).

**Photographer CRMs**

| Product | Price per month | What tiers gate | Trial |
|---|---|---|---|
| **HoneyBook** | ~$29–$109 billed yearly ($36–$129 monthly); sources conflict | Projects, automations, payments | Not confirmed |
| **Dubsado** | $335 / $525 per year (~$28 / $44 a month) | Clients/workflows, branding | Not confirmed |
| **Studio Ninja** | ~$16 / $27 / $40 | Starter caps active jobs at 5 | Not confirmed |
| **Pixieset** | Free; paid from ~$8–$10 up to ~$40–$50 | Storage, galleries, store | Free plan |

Sources: [Agiled, HoneyBook alternatives](https://agiled.app/alternatives/honeybook), [Agiled, Dubsado pricing](https://agiled.app/blog/dubsado-pricing), [Agiled, Studio Ninja vs HoneyBook](https://agiled.app/compare/studioninja-vs-honeybook), [Costbench, Pixieset](https://costbench.com/software/photography-studio-software/pixieset/).

**Israeli freelancer billing and receipts**

| Product | Price per month | Notes |
|---|---|---|
| **Green Invoice / Morning** | **Not found** in my searches | Offers a free trial with no card, described as 30 days ([Green Invoice](https://www.greeninvoice.co.il/)); renamed "morning" in Jul 2026 per [bhol](https://www.bhol.co.il/news/1427521) |
| **iCount** | **Not found** | Check icount.co.il |
| **Rivhit** | **Not found** | Check rivhit.co.il |

I could not get current ₪ prices for the three Israeli billing tools. Ask three studios what they pay today; that is more useful than a price list.

**What this tells us**
- Photographer tools sit at about **$16–$45** (₪60–₪165). A solo photographer will compare OpalSwift to these plus a bookkeeping tool.
- Studio software for classes sits at about **$60–$250** for a small studio (₪220–₪925), and higher for larger ones. Arbox, the local name, lists higher than that.
- Many tools gate by number of active clients, jobs or sessions, then by payments and automation. Few gate by login count.
- Trial models are mostly "free trial" or "free tier". I did not confirm lengths; assume 14–30 days.
- OpalSwift bundles classes, payments, receipts, waivers and CRM in one place for Hebrew-speaking studios. That supports pricing near the local studio tools, not at the cheapest photographer tool.

### 8.3 Recommended plans (₪ per month, before VAT)

> **Replaced 2026-11-11:** the owner chose two plans, **Project ₪129** (was Solo) and **Studio ₪199**, with no third Pro plan and no add-ons. The table below is kept for the feature split, which still needs her confirmation.

Three plans on top of the existing `essential` / `professional` tiers. The third tier needs a new database value (a small migration) and new flag assignments; it is not in the code today.

| | **Solo** ₪99 | **Studio** ₪169 | **Pro** ₪299 |
|---|---|---|---|
| For | Solo photographer, tutor, beautician | Dance/music/fitness studio with a few staff | Several teachers, bigger school |
| Maps to | `essential` | `professional` | new third tier |
| Active clients | up to ~100 | up to ~400 | up to ~1,500 |
| Staff logins | 2 | 8 | unlimited |
| Classes, booking, calendar | yes | yes | yes |
| Payments through your own provider | yes | yes | yes |
| Receipts, basic expenses | yes | yes | yes |
| Email reminders | yes | yes | yes |
| Quotes, contracts, gated delivery (photographers) | yes | yes | yes |
| Waivers and health declarations | yes | yes | yes |
| Families, programs/levels, public booking | no | yes | yes |
| Standing orders, dunning | no | yes | yes |
| Reports, accountant export | basic | full | full + BKMVDATA |
| WhatsApp reminders and OTP | no | allowance | larger allowance |
| Custom domain, voice reminders, AI tools | no | no | yes |
| Support | email | email | priority |

Notes:
- Numbers (clients, logins) are proposals, to be tuned with real studios. Limits that cost nothing to us (clients, logins) can be soft: warn first, block later.
- Gate messaging, not core scheduling: SMS and WhatsApp are the main variable cost (section 9).
- **Ballet school vs solo photographer:** a ballet school needs families, levels, standing orders, dunning and waivers, so it lands on **Studio**. A solo photographer needs quotes, contracts, gated delivery and receipts, which sit in **Solo**; at ₪99 they pay more than Studio Ninja ($16–$40) but get payments and receipts in one place. Consider a photographer-only Solo price of ₪79 if sign-ups stay low (verify against costs below).
- **VAT:** show prices before VAT. If OpalSwift is עוסק מורשה, add 18% (verify). If עוסק פטור, no VAT is added, and you charge the listed price only. Accountant decides.
- **Annual:** pay 10 months, get 12 (about 17% off), once card billing is live.
- **Founding-member offer:** studios in the free beta keep **a locked price for 12 months** after the trial, then move to the list price. It rewards early feedback, and the lawyer words the price lock in the terms. A ₪79 founder price on Solo is fine because it is time-limited.

### 8.4 Price test before you commit
Quote the three prices to 5–10 real studios (Creative Ballet, the photographer, and others). Ask what they pay today and what they would drop. Change nothing in the app for this step.

---

## 9. What it costs us to run

Prices are list prices found by search on 2 Nov 2026, USD where vendors quote USD. "Low / expected / high" are my planning estimates, not quotes. **₪ at $1 = ₪3.7, before VAT.**

### 9.1 Monthly cost table (fixed items)

| Item | Low | Expected | High | Source / note |
|---|---|---|---|---|
| **Supabase** (database, auth, functions) | $25 (₪93) | $35 (₪130) | $60 (₪222) | Pro $25 incl. $10 compute credit; 8 GB database, 100 GB files, 250 GB egress; extra compute and egress cost more. Free plan is dev only. [Supabase pricing](https://supabase.com/pricing.md), [JetAdmin](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/) |
| **Cloudflare** Workers (hosts the app) | $0 | $5 (₪19) | $5 (₪19) | Workers Paid is a $5 minimum with 10M requests; static assets free; Email Sending needs Paid. [Cloudflare docs](https://developers.cloudflare.com/workers/platform/pricing/) |
| **Resend** (email) | $0 | $0 until ~5 studios, then $20 (₪74) | $20 (₪74) | Free: 3,000 emails/month, 100/day. Pro $20: 50,000. [Resend pricing](https://www.resend.com/pricing.md). Cloudflare Email Sending is the "scale path" in `.env.example`. |
| **Sentry** (error tracking) | $0 | $0 until ~20 studios, then $26 (₪96) | $29 (₪107) | Developer free: 1 user, ~5k errors; Team $26 yearly / $29 monthly. [Last9](https://last9.io/blog/sentry-pricing/) |
| **GitHub** | $0 | $0 | $4 (₪15) | Free plan has 2,000 private Actions minutes/month; Pro about $4. From memory, **verify**. Public repo: $0. |
| **Claude** (development) | $20 (₪74), Pro | $100 (₪370), Max 5x | $200 (₪740), Max 20x | [Anthropic help](https://support.claude.com/en/articles/11049741), [Heyuan](https://www.heyuan110.com/posts/ai/2026-02-25-claude-code-pricing/). **Your tier is a decision.** |
| **Claude API in the app** | $0 | $0 | $0 now | `ANTHROPIC_API_KEY` is reserved in `edge-secrets.json`, but no code calls the API today (I searched the repo). Future AI features: budget ₪5–₪20 per studio per month, **estimate**. |
| **Domain** opalswift.com | ~₪4 | ~₪4 | ~₪6 | About $12–$20 a year **(estimate, check registrar)** |
| **R2 backups** (Cloudflare) | $0 | $0 | ~$1 | First 10 GB free **(verify)**; nightly dumps are small |
| **Grow partner programme** | ₪500 | ₪590 (with VAT) | ₪590 | From the owner's call with Grow. Only from phase 3. Refundable VAT if מורשה. |
| **Accountant** | ₪120 | ₪200 | ₪550 | Bookkeeping per month incl. VAT: עוסק פטור ₪120–₪300; מורשה ₪300–₪550 (single entry), ₪600–₪1,200 (double). Annual return for פטור ₪1,400–₪2,000. [Midrag](https://www.midrag.co.il/Content/Price/22913). Estimates from a bookkeeper site. |
| **Insurance** (professional/cyber) | ₪125 | ₪250 | ₪420 | ₪1,500–₪5,000 a year **(my estimate, no source)**. Ask a broker; see the legal thread. |
| **National Insurance, income tax** | n/a | n/a | n/a | See `docs/legal/BUSINESS-REGISTRATION.md` (legal thread, not duplicated here). Not a cost of the platform itself. |

**One-off costs:** lawyer review of terms, DPA and privacy policy: **₪3,000–₪10,000** (**my estimate, no source**; get 2 quotes). Business registration: see the legal thread.

### 9.2 Per-studio (variable) cost, per month

| Item | Low | Expected | High | Note |
|---|---|---|---|---|
| Twilio SMS / WhatsApp / OTP | ₪0 | ₪25 | ₪55 | Israel SMS is roughly **$0.17–$0.27 per message** (₪0.63–₪1.00), sources conflict: [Sent.dm](https://sent.dm/resources/israel-sms-pricing), [Plivo](https://www.plivo.com/sms/pricing/il/). WhatsApp prices not confirmed. Expected ~35 messages per studio. Email-only studios cost ₪0. |
| Email (Resend) | in fixed | in fixed | in fixed | ~300–600 emails per studio per month (logins, enrolment, reminders, receipts), **estimate** |
| Supabase growth (storage, egress) | ₪1 | ₪3 | ₪10 | Photographer galleries could push this up |
| Grow fees on our own subscription charges | ~1.4% | ~1.5% | ~1.6% + per-transaction fee | Reseller figures, **verify** with Grow. At ₪169 about ₪2.5 |
| **Total per studio** | **~₪10** | **~₪30** | **~₪60** | |

### 9.3 Total monthly cost at 1, 5, 20 and 50 studios (expected case)
Fixed items from 9.1: Supabase ₪130, Cloudflare ₪19, domain ₪4, Claude Max 5x ₪370, accountant ₪200, insurance ₪250, Grow partner ₪590 = **₪1,563**. Resend Pro (+₪74) from about 5–20 studios, Sentry Team (+₪96) from about 20, a bigger Supabase compute size (+₪93) at 50.

| Studios | Fixed | Variable (₪30 each) | Steps added | **Total per month** |
|---|---|---|---|---|
| 1 | ₪1,563 | ₪30 | none | **₪1,593** |
| 5 | ₪1,563 | ₪150 | none | **₪1,713** |
| 20 | ₪1,563 | ₪600 | Resend + Sentry ₪170 | **₪2,333** |
| 50 | ₪1,563 | ₪1,500 | Resend + Sentry + Supabase ₪263 | **₪3,326** |

Other cases at 20 studios: **low ₪1,190** (Claude Pro, cheapest accountant, Grow ₪500, minimal messaging); **high ₪3,940** (Claude Max 20x, מורשה accountant, heavy messaging).

Right now (beta, no business yet, no Grow partner): **₪153** platform + your Claude plan (₪74 / ₪370 / ₪740).

### 9.4 Break-even and minimum price
Break-even studios = fixed cost ÷ (price − ₪30 variable cost). Price before VAT.

| Price | With Grow partner (₪1,563 fixed) | Without Grow partner (₪973) | Lean: no Grow partner, no Claude (₪603) |
|---|---|---|---|
| ₪79 | 32 studios | 20 | 13 |
| ₪99 | 23 | 15 | 9 |
| ₪149 | 14 | 9 | 6 |
| ₪169 | 12 | 7 | 5 |
| **₪129 (Project)** | 16 | 10 | 7 |
| **₪199 (Studio)** | 10 | 6 | 4 |
| ₪299 | 6 | 4 | 3 |

(These replace the partner-fee-only table in section 7, which ignored all other costs.)

**Minimum healthy price per studio:**
- Keep variable cost under 30% of the price: ₪30 ÷ 0.3 = **₪100**. So **about ₪99** is the floor for the cheapest plan.
- To break even at about 15 studios with the Grow partner fee: ₪1,563 ÷ 15 + ₪30 = **₪134** average price. A mix of Solo ₪99, Studio ₪169 and Pro ₪299 with most studios on Studio gets there.
- ₪79 only works for a founder price (time-limited) or a promo.
- Messaging is the cost to watch. If a plan includes too many WhatsApp messages, one busy studio can cost more than its subscription. Cap the allowance or bill extra messages at cost plus a margin.

---

*Sources are listed inline. Items marked (verify) must be confirmed with Grow, an accountant or a lawyer before building on them. Grow facts come from search snippets and third-party pages (Grow's own sites were blocked), and from the owner's call with Grow for the partner programme.*

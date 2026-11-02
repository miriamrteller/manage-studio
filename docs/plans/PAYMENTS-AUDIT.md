# Payments and invoicing audit

Written 2026-11-02 on `main` @ 9e73b50 (branch `audit/payments`). Audit only: no app code changed.
Question from the owner: "make sure all the online payment and invoicing features work properly".

## How I checked (read this first)

The local Supabase stack cannot run in this cloud box (Docker image downloads are blocked), and I did not call any real provider API or hosted database. So:

| Tag | Meaning |
| --- | --- |
| **[T]** | **Ran**: the payment-related unit tests (`pnpm exec vitest run grow invoice4u ypay icount tranzila offline job-ypay check-missing provider-isolation enrolment-provider bundled`): **38 files, 264 tests, all pass.** They use fake providers and fake databases, so they prove the logic, not the real provider. |
| **[D]** | **Saw running** in the browser-only demo builds (ballet: "Pay at the studio" enrolment end to end; photographer: payments settings). Fake data, no real payments. |
| **[C]** | **Read from code only.** |

Nothing here was run against a real Grow, iCount, Invoice4U, YPay, Tranzila, Yesh or Green Invoice account. "Works" below means "the code is complete and tested with fakes", unless I say it was seen live. Almost nothing has been seen live: the repo's own notes say Grow live sandbox E2E is "still manual", iCount live is "deferred", and Invoice4U live ("U0-live") is not done (`docs/IMPLEMENTATION_STATUS.md`).

## YPay × photographer (for tomorrow's meeting)

**Would it work in prod today, once the encryption key is in? Almost: yes for the money path, with three things to fix or do by hand.** Checked from code and the tests that ran [T] (YPay and job-payment tests all pass); never seen against the real YPay (the repo's own plan does a ₪1 live test at the meeting: `docs/deployment/PHOTOGRAPHER-BETA-SUPABASE.md` steps 9–10).

| Step | Status | What happens / file |
| --- | --- | --- |
| **Connect: keys in** | **Partly** | Works, but through the wrong-looking form. Settings → Payments shows the generic Stripe-style form: type the YPay **client ID into "Publishable key"** and the **client secret into "Secret key"**; leave "Webhook secret" empty (it does nothing for YPay). It is saved by `save_tenant_payment_credentials` and read back by `payments/ypay/credentials.ts`. A proper `save_tenant_ypay_credentials` exists in the database (migration 20260722000200) but no screen uses it. [D][C] |
| **Connect: verify** | **Not on screen** | `verify-ypay-credentials` (checks the keys against YPay's token call) exists, but no button calls it. At the meeting the first real check will be the ₪1 payment. [C] |
| **Connect: stored encrypted** | **Works once the key is in** | `pgp_sym_encrypt` with `get_app_encryption_key()`. **Without the key, saving fails with "app.encryption_key is not configured"** and nothing is stored. Insert the key first (GO-LIVE-PLAN Phase B). [C] |
| **Quote → accept** | **Works** | `accept-quote` makes the job, a deposit request and a balance request, and emails the booking confirmation with the deposit pay link. [C][T] |
| **Deposit / balance: pay** | **Works in code** | Client opens `/pay/:token` → `job-payment-request-public` → `providers/ypay.ts createCharge`: pending payment row first, hosted YPay page, gross amount, installments, return URLs back to the pay page. YPay needs the client's **email and name** (it errors if missing). `YPAY_API_BASE` defaults to the real YPay host, so no extra setting. Needs `APP_URL` (already a required secret). [T][C] |
| **Webhook / callback** | **Works in code, and safe** | YPay signs nothing, so `handle-payment-event` re-checks the transaction with YPay (`getTransactionsInfo`), compares the amount, fails closed, and is idempotent (replays are no-ops; a second different payment for one request is flagged for a manual refund). Settles the job request, not an enrolment. [T][C] |
| **Document after a card payment** | **Works in code, one risk** | YPay issues it with the charge and emails the client (`mail: true`, Hebrew only). The type sent is 109 (חשבונית מס קבלה) unless `tenants.vat_type = 3`, which no screen sets: see **Business status** below. If the photographer is an exempt dealer (עוסק פטור), ask YPay at the meeting whether it accepts 109 for her account. If the document never arrives, `check-missing-documents` alerts after 30 minutes. [T][C] |
| **Document after cash / bank transfer** | **Works in code** | `invoicing/providers/ypay.ts` calls YPay's `/document` (type 108/109, method cash or bank transfer). Needs the client's email (else the row goes "dead" and an admin is alerted). Needs `ISSUE_DOCUMENT_URL` / the cron set. [T][C] |
| **Refund** | **Partly** | YPay's API has **no refund and no credit note**. The photographer refunds in the YPay dashboard, then records it in OpalSwift as a manual refund (`manual: true` in `jobPaymentService.ts`: no provider call, marks the request `refunded_manual`). Using the normal refund button on a card payment returns "process refunds in the YPay dashboard". No credit document is issued from the app. [T][C] |

**Do before the meeting**
1. Insert the encryption key (prod). Without it nothing can be saved.
2. Confirm prod has no `*_MOCK` secrets (deploy-prod already refuses them) and `APP_URL`, `CRON_SECRET`, `ISSUE_DOCUMENT_URL` are set; deploy all functions; `pnpm verify:prod`.
3. Create the studio with payments **YPay** and invoicing **YPay** (the wizard allows it; the other combinations are riskier).
4. Know which dealer type she is (see below) and ask YPay which document type her account accepts.

**At the meeting** (adds to the existing plan): enter keys using the labels above, run the ₪1 card payment, check the document and that the request turned "paid", then one bank-transfer receipt, then a refund done in YPay and recorded manually.

**Fix soon** (P1 list below): label the credential form and add "Test connection"; remove the business-status switch on the document type.

## Summary (phone-readable)

**Not ready for a studio to take real money, except two paths.**

| Path | Verdict |
| --- | --- |
| **Pay at the studio (offline)** for dance, plus recording a cash payment | **Works** [D][T][C]. This is Creative Ballet's plan. Caveat: the tax document (see below). |
| **YPay** for a photographer: deposit/balance requests, hosted page, verified callback | **Works in code and tests** [T][C], never seen live. Needs: a real-key test, and the credential screen fixed (see P1 #4). |
| Grow | Mostly built. **Unsafe by default** (unauthenticated payment notice) and **points at the sandbox unless one setting is set**. |
| Invoice4U | Built and the safest design (fails closed), but never run live. |
| iCount | **Mock only.** In live mode it cannot confirm a payment, test the connection, or refund. |
| Tranzila | **Broken**: a successful payment is read as failed. No settings screen, no tests. |
| Yesh | **Not built** (offered in the wizard but always errors). |
| Green Invoice | Built, but always issues a tax invoice-receipt. Wrong for an exempt dealer (עוסק פטור). |

**Biggest risks (P1)**
1. **Grow payment notices are not authenticated** unless a webhook key is stored, and nothing in the Grow settings screen sets one. The amount comes from the notice, not from our records. A parent could mark their own enrolment as paid. (Invoice4U and YPay were built to avoid exactly this.)
2. **Grow talks to the Grow sandbox unless `GROW_API_BASE` is set** (it is an optional secret). Live money would go nowhere.
3. **A hidden field decides the document type.** `tenants.vat_type` (default "VAT included", no screen sets it) picks YPay's document type (108 receipt / 109 invoice-receipt), the wording in our own document email, and Grow's `vatType`. The owner's rule is that business status must not change what the app does: see the table in "Business status must not change what our app does".
4. **YPay owners must type their credentials into boxes labelled "Publishable key / Secret key / Webhook secret"**, and there is no "Test connection" button for YPay (the check exists on the server; the screen never calls it). Tranzila has no credential screen at all.
5. **Cash payments + the wrong invoicing service.** Recording a cash payment only produces a document if the invoicing service supports standalone documents (YPay, Green Invoice). Grow, iCount, Invoice4U, Tranzila and Yesh refuse standalone documents, so a "Pay at the studio" studio with one of those ends up with documents stuck as "dead" and an alert. The wizard does not stop that combination.
6. **No encryption key in prod yet.** Saving any provider's keys will fail loudly (by design). Parents of a studio that picked a card provider but did not connect it see a raw server message.

## Per provider × flow

Status: **Works** = complete and tested with fakes; **Partly** = built with a real gap; **Broken** = will fail or do the wrong thing; **Not built**. Tags show how I checked. File paths are under `supabase/functions/_shared/` unless noted.

### Payment providers

| Provider | Connect (keys, check, encryption) | Enrolment checkout (success / fail / cancel) | Webhook (auth, idempotency, status) | Refund | Photographer job deposit/balance |
| --- | --- | --- | --- | --- | --- |
| **offline** | **Works** [D][C]. No keys. Instructions text in Settings → Payments (`OfflinePaymentsSettingsForm.tsx`). | **Works** [D][T]. Place reserved as `pending_payment`; admin records payment with `record-payment`. A parent who walks away leaves a pending place (no online cancel; dunning ladder covers reminders: `offline-dunning-ladder.test`). | n/a | **Works** [C]: recorded as a manual refund (`process-refund`). | **Works** [C]: `record-job-payment` (cash/bank). |
| **grow** | **Partly** [T][C]. `GrowSettingsForm` → `save_tenant_grow_credentials` (encrypted) + `verify-grow-credentials` (calls `getApiUserPermissions`). **No screen to set the webhook key.** Live sandbox E2E "still manual". | **Partly** [T][C]. `providers/grow.ts` `createCharge` → hosted page; fail event audits; cancel = no event, place stays pending. Real calls to Grow never made. Defaults to **sandbox** URL (`GROW_API_BASE` is optional: `supabase/edge-secrets.json`). | **Partly / P1**. `verifyGrowWebhookKey` is **opt-in**: with no key stored the notice is accepted (`providers/grow.ts:149`). Amount and tenant come from the body (`parseGrowNotify`), no comparison with what we charged. Idempotent by `provider_payment_ref` [T] (`grow/__tests__/gaps.test.ts`). `approveTransaction` only checks HTTP ok. | **Works** [T] (`grow-refund.test`), via `refundTransaction`; provider's same-day rules surface as a 422 message. | **Broken**. `createJobPaymentRequestCharge` works, but only the YPay callback settles a job request (`ypay/process-callback.ts` → `markJobPaymentRequestPaid`). A Grow payment would not mark the request paid. |
| **icount** | **Partly** [T]. `IcountSettingsForm` + save RPC. `verifyCredentials` **throws** in live mode: "requires live API (I2b)" (`providers/icount.ts:102`). | **Broken in live** [C]. `createCharge` builds a redirect URL, but `constructEvent` **throws** "IPN parser requires I0-live capture" (`:91`), and the event router can't find a tenant in a form-encoded notice. A paid enrolment would never settle. Works only with `ICOUNT_MOCK`. | **Not built** live (parser exists in `payments/icount/ipn.ts` and is tested [T] but not wired). | **Not built** (throws). | **Broken** (same as Grow). |
| **invoice4u** | **Works** [T][C]. `Invoice4uSettingsForm` + `verify-invoice4u-credentials` (live check behind `INVOICE4U_LIVE_VERIFY`). Base URL **must** be set (QA vs prod), otherwise it refuses: good. | **Works in code** [T][C], never live. Pending row before redirect, amount-mismatch check, success verified against the clearing log, **fails closed** (`invoice4u/verify-callback.ts`). | **Works** [T]: no signature exists, so it verifies server-side; idempotent via the pending row. Open question noted in code: lookup by id not confirmed live. | **Not built** ("U4-live": `providers/invoice4u.ts:208`). Admin can record a manual refund. | **Broken** (not wired to job requests). |
| **ypay** | **Partly**. Server side is complete: `save_tenant_ypay_credentials` (migration 20260722000200), `verify-ypay-credentials`. **The screen has neither**: the owner uses the generic Stripe-style form (`PaymentSettingsForm.tsx`: "Publishable key" = client id, "Secret key" = client secret; "Webhook secret" unused) and there is no Test connection. | **Works in code** [T][C]. Pending row, hosted page, return URLs, installments; failed callback leaves pending. | **Works** [T]: unsigned, so it re-checks the transaction with `getTransactionsInfo` and fails closed (`ypay/verify-callback.ts`); duplicate callbacks tested (`job-ypay-callback-idempotency.test`, `ypay-callback-verify.test`). | **Not supported by YPay's API**: throws "process refunds in the YPay dashboard"; admin then records a manual refund. Partly. | **Works in code** [T] (`job-payment-request-public`, `/pay/:token`, `markJobPaymentRequestPaid`). Never seen live. |
| **tranzila** | **Broken / Not built in the UI**: there is no credential screen. Server RPC `get_tenant_tranzila_credentials` exists; `verifyCredentials` only checks the keys are present, it does not call Tranzila. | **Broken** [C]. The bridge reads a result of "paid"/"succeeded" but the adapter returns `completed`, so **every success is read as a failure** (`providers/tranzila-payment.ts:97` vs `providers/tranzila.ts:143`). It also expects engagement ids that the adapter never returns, and createCharge inserts no pending row. | **Broken**. "Signature check" is a comment; `handleWebhook` just trusts the posted `processor_response_code`. Form-encoded notices are not routed (no tenant in the body). | **Not built** (throws). | **Broken**. |
| **stripe / mock** | Not offered in the wizard. `mock` only works where a `*_MOCK` flag is on; deploy-prod refuses `*_MOCK` secrets [C] (`.github/workflows/deploy-prod.yml:262`). | n/a | n/a | n/a | n/a |

### Invoicing providers (tax documents)

| Provider | Connect | Document after an online payment | Document after a cash payment (standalone) | VAT wording |
| --- | --- | --- | --- | --- |
| **none** | n/a | Nothing issued: `enqueueDocument` skips [T] (`offline-studio-no-documents.test`). | Nothing issued. | n/a |
| **grow** | Shares the Grow keys. | **Partly**: Grow issues it with the payment; arrives on the invoice notice (key check opt-in, same as above) [T]. | **Broken**: standalone not supported, non-retryable error ⇒ queue row `dead` + admin alert (`invoicing/providers/grow.ts`). | `vat_type` passthrough, but nothing sets it (see below). |
| **icount** | Shares iCount keys. | **Partly** (mock only): document-webhook parser tested [T], live not captured. | **Broken** (same). | Provider account decides; app passes nothing. |
| **invoice4u** | Shares Invoice4U keys. | **Works in code** [T] via callback (`DocCreated`). | **Broken** (same). | Provider account decides. |
| **ypay** | Shares YPay keys. | **Works in code** [T]: docType 109 invoice-receipt, or 108 receipt when `vat_type = 3` (`ypay/document.ts`). | **Works in code** [T] (`ypay-offline-receipt.test`: cash with exempt vs VAT). | Correct *if* `tenants.vat_type` is set right (nothing sets it). |
| **green_invoice** | `InvoicingSettingsForm` + `verify-invoicing-credentials` [C]. | n/a (standalone). | **Partly**: implemented (`invoicing/providers/green-invoice.ts`), but **always type 320** (tax invoice-receipt), ignoring dealer status. Wrong for an exempt dealer. | Not handled. |
| **tranzila** | No screen. | **Not built**: "issueDocument is not implemented yet" (`invoicing/providers/tranzila.ts`). | Same. | n/a |
| **yesh** | Generic invoicing form; presence check only. | **Not built** ("pending Yesh API access"). | Same. Still offered in the wizard (`provision-studio.ts` list). | n/a |

### Business status must not change what our app does

Rule from the owner: VAT and tax-document rules are the invoicing provider's job. Our app should not compute or show VAT differently by status, should pass amounts as entered, and should work the same if the status changes later.

**Already right [C]:**
- Prices are **gross**; the app stores no VAT split (`payments.vat_*` are 0 for jobs and recorded payments: `create-request-charge.ts`, `record-job-payment/index.ts`, `record-payment/index.ts`). Quotes show a gross total with the note "the tax document shows the VAT" (`QuoteTotalsSummary.tsx`).
- YPay gets the amount as entered with `vatIncluded: true` (`providers/ypay.ts`). The providers issue the document.
- Settings → Legal's "business status" only changes the printed text of the legal documents (`apps/web/src/legal/render.ts`). That is fine.

**Places where business status (via `tenants.vat_type`) changes app behaviour: each is a fix:**

| # | Where | What it does | Fix |
| --- | --- | --- | --- |
| 1 | `payments/ypay/document.ts` `ypayDocTypeForVatType`, used by `providers/ypay.ts` (card) and `invoicing/providers/ypay.ts` (cash) | Chooses document type 108 (receipt) or 109 (invoice-receipt) by `vat_type = 3`. YPay's API requires a type (0 is rejected). | Replace with one explicit provider setting, "Which document does YPay issue for this studio?" (default 109, or 108), set once by the owner and changeable; the app sends it unchanged. Better still, if YPay can report what the account may issue, read it from YPay. Not tied to any legal-status field. |
| 2 | `payments/send-payment-document-client-email.ts:142,184-193` | The app's own email says "Receipt" or "Invoice-receipt" by `vat_type`. | Use the document type the provider actually returned (or no label), not a guess from status. |
| 3 | `payments/providers/grow.ts:189-202,268` | Passes `vatType` (1/2/3) from the tenant to Grow. | Let Grow decide from the owner's Grow account; stop sending it, or make it a clearly named Grow setting, not business status. |
| 4 | `invoicing/providers/green-invoice.ts` | Always type 320 with `vatType: 0`; ignores status. | Not status-driven (good), but the type should come from the same "which document" provider setting as #1. |
| 5 | `tenants.vat_type` column (default 1) | A hidden status field that no screen sets; it silently drives #1–#3. | Remove it, or rename it to the provider setting in #1; do not infer it from Settings → Legal. |
| 6 | Wizard "Tax documents: None (not a registered business)" (`StudioSetupWizard`, `INITIAL_FORM`) | Choosing "none" turns document issuing off (`enqueueDocument` skips for `invoicing_provider = none`). | Fine as a provider choice, but wording ties it to business status. Reword to "I don't issue documents through OpalSwift"; changing it later is the same switch, no other behaviour. |

**Same later if the status changes:** with #1–#5 fixed there is nothing to re-run: the owner changes the document setting at the provider, and old payments keep the documents they already have.

### Cross-cutting

| Topic | Status | Notes |
| --- | --- | --- |
| **Encrypted key storage** | **Works** [C] | Keys are encrypted with `pgp_sym_encrypt` using `get_app_encryption_key()` (`migrations/20260608001600_finance.sql`). Only service-role code can decrypt. |
| **Without the encryption key (prod today)** | **Fails loudly, by design** | `get_app_encryption_key()` raises "app.encryption_key is not configured" (`migrations/20260608000200_core_tenants.sql`). Saving keys errors in the settings screen; any studio already set to a card provider fails at checkout. Fix: insert the key (GO-LIVE-PLAN Phase B) before any studio connects a provider. |
| **Connect later** | **Partly** | Wizard now defaults to offline/none [C]. Choosing a card provider in the wizard stores only the slug. Until keys are saved, parent checkout returns a 500 whose raw message ("Grow credentials not configured") is shown to the parent (`create-checkout/index.ts`, `EnrolmentPaymentForm.tsx`). No guard, no friendly text, no fallback to "pay at the studio". |
| **Switching provider later** | **Partly** | A plain database update from Settings (`OfflinePaymentsSettingsForm.tsx:51`): no check that keys exist, no warning about open charges, saved cards or billing schedules from the old provider. Old payments keep their own provider slug for refunds (good: `refund-provider.ts`). |
| **Failure / cancel** | **Partly** | Failed card → audit event, place stays `pending_payment`. Customer closing the hosted page sends nothing; the place stays pending until reminders/dunning. |
| **Invalid wizard combinations** | **Broken** | `provision-studio.ts` accepts any payment × invoicing pair, e.g. offline + Grow invoicing (cash docs impossible), or Grow payments + Yesh. |
| **Renewals (monthly billing)** | Grow **Works** [T]; YPay **Not supported** by YPay; iCount, Invoice4U, Tranzila **Not built**. | A class studio on a provider without tokens can't charge monthly unattended. |
| **`*_MOCK` flags** | OK | `GROW_MOCK`, `ICOUNT_MOCK`, `INVOICE4U_MOCK`, `YPAY_MOCK`, `TRANZILA_MOCK` are dev/CI only; deploy-prod rejects `*_MOCK` secrets. **Mock-only (no live path finished): iCount.** Mock-parity only, live untested: Grow, Invoice4U, YPay. Tranzila has a mock but a broken live bridge. |
| **Who may refund / record** | **OK** [C] | `process-refund`, `record-payment`, `record-job-payment` require a signed-in tenant admin (they set `verify_jwt = false` but do their own check). |

## Prioritised fix list

P1 = must fix before a studio takes real money. Effort: S = under half a day, M = 1–2 days, L = more.

### P1

| # | Fix | Effort |
| --- | --- | --- |
| 1 | **Authenticate Grow notices**: require a stored webhook key (generate one when keys are saved, show the URL + key to paste into Grow) and reject if absent; compare the notified `sum` and tenant/engagement with our pending record, as Invoice4U/YPay do; require `approveTransaction` to return status 1. | M |
| 2 | **Grow base URL**: make `GROW_API_BASE` required in prod (move to `required` in `edge-secrets.json`, fail verify-prod when it contains `sandbox`). | S |
| 3 | **Remove the business-status switch** (see "Business status must not change what our app does"): one explicit provider setting for which document YPay/Green Invoice issues, send amounts unchanged, drop `vat_type` inference from the email and Grow code. | S–M |
| 4 | **YPay (and Tranzila) credential screen** (first: YPay; the photographer's own path): proper labels ("Client ID", "Client secret"), a "Test connection" button calling `verify-ypay-credentials`; hide the webhook box. This is the photographer's own path. | S–M |
| 5 | **Wizard/Settings combination rules**: offline or Grow/iCount/Invoice4U payments only pair with an invoicing service that can issue standalone documents (YPay, Green Invoice) or "none"; hide Yesh and Tranzila invoicing until built. | S |
| 6 | **Unconnected provider guard**: block saving "card" in the wizard/Settings until keys verify (or auto-fall back to "pay at the studio" with a banner); show parents a friendly "this studio isn't taking card payments yet" instead of a raw error. | M |
| 7 | **Encryption key in prod** before anyone connects a provider (GO-LIVE-PLAN Phase B). | S (owner step) |
| 8 | **One live, small real-money test per provider the owner will really use** (YPay for the photographer; Grow or Invoice4U for classes later), including a failed and a cancelled payment, a refund (manual for YPay) and the document. Nothing here has been proven live. | M |

### P2

| # | Fix | Effort |
| --- | --- | --- |
| 9 | **Tranzila**: fix the status mapping (`completed`), return and verify the engagement metadata, add a pending row, verify the notice server-side, add tests and a settings screen. Or hide Tranzila from the wizard until done. | L |
| 10 | **iCount live**: wire `ipn.ts` into `constructEvent`, add a real `verifyCredentials`, a refund call. Or hide iCount until then. | L |
| 11 | **Job payment requests for non-YPay providers**: settle `job_payment_request` in the generic callback, or restrict the photographer's online path to YPay and say so in Settings. | M |
| 12 | **Standalone documents** for Grow/iCount/Invoice4U cash payments are impossible: tell the owner at setup ("receipts for cash need Green Invoice or YPay"), and surface `dead` document rows on the finance page. | S–M |
| 13 | **Switching provider**: warn about open charges, saved cards and billing schedules; keep old provider credentials until the last open item is closed. | M |
| 14 | **Refund support**: Invoice4U refund call, Tranzila refund; show YPay's "refund in the YPay dashboard" in the refund modal and record it as manual. | M |

### P3

| # | Fix | Effort |
| --- | --- | --- |
| 15 | Cancel handling: add a "customer closed the page" reminder and an expiry for abandoned card attempts (class studios). | M |
| 16 | Yesh invoicing client (when API access exists). | L |
| 17 | Finance page: show VAT and pretax per payment for Grow/Tranzila rows (today 0, the document carries the VAT). | S |

## Still to do in this audit
- A real-key test of YPay (the photographer's path) and of the first class-studio provider, run by the owner or with sandbox keys; every "Works" above is based on fakes until then.
- If the local stack becomes available: run `supabase/tests` and the finance E2E (`apps/web/e2e/finance-*.spec.ts`) against it.

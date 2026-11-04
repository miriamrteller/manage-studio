# Takbull integration plan

Status: being built. PR 1 (client, keys, Test connection) merged as #352; PR 2 (card payments + takbull-ipn) in progress. Owner direction (2026-11-04): Takbull may become the default for new
studios. Source for every Takbull fact below: the official API docs,
https://api.takbull.co.il/ApiDocs (read 2026-11-04). Anything the docs don't state is listed under
"Open questions" and is not designed around.

## What Takbull gives us (confirmed in the docs)

| Need | Takbull | Endpoint |
|---|---|---|
| Card payment on a hosted page or iframe | Yes; card, Bit (21), Apple Pay (32), Google Pay (33) | `GetTakbullPaymentPageRedirectUrl` → `/PaymentGateway?orderUniqId=` |
| Paid notice to our server | Yes (IPN, a GET with query string), **not signed** | IPN → re-check with `ValidateNotification` |
| Payment details (amount, token, document) | Yes | `GetTransaction`, `GetOrder` |
| Saved card, charged later with no client | Yes | token on the transaction; `ChargeToken` |
| Own recurring (standing order) | Yes (DealType 4), plus `CancelSubscription` | not used, see Monthly |
| Instalments | Yes (DealType 2, NumberOfPayments) | |
| Refunds, full and partial, with credit document | Yes (RefundType 1–4) | `Refund` |
| Document with the charge | Yes (`CreateDocument`, `DocumentType` 400/320…) | |
| Standalone document for money taken outside Takbull | Yes (cash, cheque, wire, custom e.g. Bit) | `DocumentApi/Create` |
| Exempt dealer (עוסק פטור) | Yes (BusinessType 3 sets VAT handling) | |
| Open a studio's account from our platform | Yes (affiliate: child merchant, clearing by UPay) | `Account/CreateAccount` |
| Per-studio document settings | Yes (default type, sender name, email text, theme, numbering) | `Account/UpdateDocumentSettings` |
| Sandbox | Credentials on request from Takbull support | |

Owner confirmed: **a business that isn't registered can't take card payments through Takbull.**

## How it fits our code (no copying another provider)

What already exists and Takbull plugs into:

- **Provider registry and factory:** `_shared/payments/registry.ts`, `_shared/payments/index.ts`, `PaymentProvider` in `_shared/payments/types.ts`.
- **Pending payment row before the hosted page:** the payment exists before the client pays, and the notice settles it. This covers job requests (`markJobPaymentRequestPaid`) and enrolments (`finalisePayment`).
- **Monthly billing:**
  - schedules, month amounts, one-off amounts and dunning: `run-monthly-billing`, `_shared/payments/renewal-billing.ts`;
  - saved cards: `payment_method_tokens`;
  - card link for students who have no card yet: `_shared/payments/card-link.ts`.
- **Refunds:** `process-refund` → `refund-provider.ts` → `refundCharge`; amounts from `planRefund`.
- **Documents:**
  - routing: `enqueue-document.ts` `documentRouteFor`;
  - documents that come with a charge: `bundled-document.ts`;
  - what was issued: `document-kind.ts`;
  - our own client email: `send-payment-document-client-email.ts`.
- **Pairing and choices:** `provider-pairing.ts` (web + edge copies), `provision-studio.ts` lists, `PaymentProviderChoice`, `providerLimits.ts`.

### Decisions (proposed; owner to confirm where marked)

1. **Slug `takbull`**, the same slug for payments and invoicing. A studio on Takbull has one company for both.
2. **The payment notice gets its own function, `takbull-ipn`.** `handle-payment-event` is POST-only and recognises providers by the body; Takbull's notice is a GET with query parameters.
   - The function accepts GET and POST and runs without a JWT.
   - It **never trusts the notice**. It looks up the pending payment by `order_reference` (our payment id) and the `uniqId` we stored, calls `ValidateNotification`, then `GetTransaction`. It checks the amount and the order, then settles.
   - It's idempotent, so a replay settles nothing twice.
   - The redirect back to our site only shows a result page.
3. **Monthly fees use our own billing**, with `ChargeToken` for each month. Takbull's own standing order (DealType 4) is not used. Month amounts, one-off months, pausing, dunning and "pay at the studio until a card is saved" all live in our schedules, and two schedulers would charge twice.
   - `takbull` joins `RENEWAL_TOKEN_PROVIDERS` and `CARD_LINK_PROVIDERS`.
   - The monthly-class guard (`guard_offering_recurring_needs_grow`) only blocks ypay and invoice4u, so Takbull studios can make monthly classes without a DB change.
4. **Documents for card payments come with the charge** (`CreateDocument: true`). `documentRouteFor` treats a Takbull charge as `skip_issued_with_charge`.
   - The notice handler stores the invoice id and number with `persistPaymentDocumentFields`, plus the issued document kind.
   - **Payments recorded by hand** (cash, transfer, Bit) and manual refunds go through the queue to a Takbull invoicing adapter that calls `DocumentApi/Create`: `cashes`, `wireTransfers`, `customPayments` (Bit), and `isNegativeDocument` for refunds.
   - So Takbull is **not** bundled-only: Bit / PayBox stays visible for recorded payments, and the no-document notes don't apply.
5. **Which document**, receipt 400 or tax invoice-receipt 320: an explicit studio setting, prefilled from business status and never switched by it. This is the same rule as #340 (Green Invoice). We send it on every request, and also push it as `DefaultDocumentType` through `UpdateDocumentSettings`. **Owner decided:** a Takbull-only column, `tenants.takbull_document_type` (PR 2), like YPay's and Green Invoice's.
6. **Who emails the document (owner decided):** Takbull emails the official document. OpalSwift sends its own confirmation, without a second copy of the document. Our document email only goes out for payments recorded by hand, which Takbull doesn't know about.
7. **Studio keys** (`API_Key`, `API_Secret`) are stored encrypted, like the other providers:
   - saved through a `save_tenant_takbull_credentials` SECURITY DEFINER RPC (listed in `supabase/security/definer-execute.json`);
   - checked by a `verify-takbull-credentials` function, using a read-only call: `GetDocumentSettings`.
8. **Opening a studio's account from our signup** (`CreateAccount`) is a separate, later step. It needs the owner's affiliate agreement with Takbull and a **platform (parent) key**:
   - The parent key is stored once, in Supabase edge secrets (`supabase/edge-secrets.json`). If it ever has a second copy, it goes into `docs/deployment/SHARED-SECRETS.md` with a rotation.
   - The child's keys arrive in Takbull's account notice and are stored encrypted by the server; they are never shown or logged.
   - The owner's ID number and bank details pass straight through to Takbull and are **never stored** by us. This goes on the lawyer list.
   - **Who pays (owner decided):** OpalSwift pays a Takbull platform price on the parent side, and each studio pays only its own per-transaction fees, on its own merchant account. So `CreateAccount` uses `SubscriptionPayer: "Parent"` with the package OpalSwift agrees with Takbull. The package id is configuration, not hardcoded. Takbull's platform price is not confirmed yet.
   - Confirmed in the docs: the UPay clearing account is opened in the studio's own name (its business number, the owner's ID, its own bank account), so the studio is always the merchant.

## The PRs (each hidden from studios until the last)

1. **Client and keys.**
   - What: Takbull HTTP client (headers, errors, timeouts); keys RPC, Settings form and "Test connection"; a `TAKBULL_MOCK` provider for tests and dev (never set in prod).
   - Tests: fakes only.
2. **Card payments.**
   - What: `createCharge` with a pending payment row. Our payment id is `order_reference`; we pass the IPN URL with the tenant, return URLs, products for the document line, and the document type.
   - What: the `takbull-ipn` function (validate → transaction → amount check → settle → document fields → save the card token when asked); first payments for enrolments and bookings.
   - Tests: replay, amount mismatch, unverified notice, late redirect.
3. **Monthly fees.**
   - What: `chargeWithToken` → `ChargeToken`; the result comes back through the same notice handler, with dunning on failure; `takbull` in the renewal and card-link lists.
4. **Refunds.**
   - What: `refundCharge` → `Refund`, full (type 2) or partial (type 4) with document. It needs Takbull's `transactionInternalNumber`, stored as `provider_payment_ref` once the notice settles; `refundDocumentNoteKey` covers Takbull too.
   - How (built):
     - The whole payment, with nothing refunded before, is type 2 with no amount. Anything else, including what is left after a partial refund, is type 4 with `RefundAmount`. Docs: types 1–4, and "Required for partial refund".
     - Takbull's refusal (`internalCode` not 0) reaches the admin and nothing is recorded. A payment with no transaction number is refunded in Takbull and recorded here.
     - A refund made through Takbull queues no document of ours, since Takbull issues it ("with document"). A refund recorded by hand is still queued (the Takbull invoicing adapter is PR 5).
     - The docs don't say which document type types 2 / 4 issue, or when `documentId` is set; neither is relied on.
5. **Documents for recorded payments.**
   - What: the Takbull invoicing adapter (`DocumentApi/Create`); the 400/320 setting; pairing (`takbull` invoicing with `takbull` or offline payments); issued-document-kind mapping; the accountant export.
   - How (built):
     - `TakbullInvoicingProvider` (`invoicing/providers/takbull.ts`) documents cash (`cashes`), bank transfer (`wireTransfers`) and Bit (`customPayments`, `creationDate` required) recorded by hand. The type is the studio's setting (400 / 320). `sendToCustomer: false`, because OpalSwift emails the client for money recorded by hand (decision 6).
     - Refunds recorded by hand: `isNegativeDocument`, 401 for a receipt studio and 330 for a tax invoice-receipt studio (lawyer list row 23, `[[ACCOUNTANT: confirm]]`).
     - Card money is never documented here: a Takbull card payment's document comes with the charge (`documentRouteFor`: `skip_issued_with_charge`). A refund of a Takbull card payment recorded by hand is `not_issued`, to be done in Takbull.
     - Takbull returns the document number and id but no link (none in the docs), so the client email has no link.
     - Pairing: `takbull` invoicing pairs with `takbull` or `offline` payments (web + edge), but is **not** in `PAIRABLE_INVOICING_PROVIDERS`, so it isn't offered until PR 8.
     - The accountant export uses the issued document kind; "Takbull" / "תקבול" added to the provider names.
     - `documentDate` is not sent (its format isn't documented), so Takbull dates the document itself.
6. **Online Bit, instalments and project payment links.**
   - What: `PaymentMethodType: 21` with the `IsMobile` deep link in the checkout shells; `DealType: 2` for instalments; `takbull` in `JOB_ONLINE_PAYMENT_PROVIDERS`.
   - How (built):
     - **The Takbull checkout page:** the enrolment checkout shows Takbull's payment page in the hosted-page shell, and waits for the notice like Grow. Until now there was no Takbull shell.
     - **Bit, on a phone only:** "Pay with Bit" makes a Bit order (`PaymentMethodType: 21`, `IsMobile: true`) and opens the link Takbull returns, which opens the Bit app. The docs only describe Bit on a phone (open question 10), so it isn't offered on a computer.
       - Where: the enrolment checkout and the project pay page (`/pay/:token`).
       - Bit is one payment: no instalments with Bit.
     - **Instalments:** unchanged from PR 2. `DealType: 2` with `MaxNumberOfPayments` and `NumberOfPayments: 1`. The docs don't say what `MaxNumberOfPayments` does (open question 10); at worst the client pays in one go.
     - **Project payment links:** `takbull` in `JOB_ONLINE_PAYMENT_PROVIDERS` (web + edge). `takbull-ipn` already settles the request (PR 2).
7. **Open the studio's Takbull account from signup** (after the owner's agreement and legal review).
   - What: `CreateAccount`, prefilled from the studio profile (name, business number, business status → BusinessType, address, phone, email, MCC from the field); the account notice; `UpdateDocumentSettings`.
8. **Make it the default.**
   - New registered studios get `takbull` / `takbull`.
   - Studios **not registered** get pay at the studio and no documents. The wizard needs business status, prefilled exempt dealer and editable, because Takbull requires a registered business.
   - Takbull first in the provider choice, with its confirmed "can't do" lines (none known yet).
   - Docs: `PAYMENTS-AUDIT.md`, the guides, the lawyer list (Takbull as a sub-processor; onboarding data).
   - Existing studios keep their provider; nothing is removed.

## What changes elsewhere

- **Pairing** (web + edge must agree): add `takbull` everywhere a provider list lives:
  - `PAIRABLE_INVOICING_PROVIDERS`;
  - the switch-until-first-payment lists;
  - `monthlyFeesSupported`;
  - `STUDIO_PAYMENT_PROVIDERS` / `STUDIO_INVOICING_PROVIDERS`;
  - the registry slug enums.
- **Bit:** card-side Bit becomes possible online. Recorded Bit stays as it is.
- **Demo seed and fixtures:** a Takbull studio.
- **Lawyer list:** Takbull as a data sub-processor (privacy policy, DPA), and the onboarding pass-through of ID and bank data. `[[LAWYER: confirm]]`

## OpalSwift's own billing of studios (owner decision; not built yet)

OpalSwift itself only needs Takbull. OpalSwift bills studios for their plan (trial, then paid) as a **Takbull merchant**, with its own Takbull account. There is no Grow account for OpalSwift.

- **Card at sign-up, or when the trial ends:** a Takbull payment page for OpalSwift's own account. The card token is kept for monthly charges.
- **Monthly charge:** `ChargeToken` on OpalSwift's own account, from a platform billing job. This is a separate schedule from the studios' billing of their clients.
- **Documents to studios:** issued by OpalSwift's Takbull account (`CreateDocument` with the charge), addressed to the studio's business.
- **Separation:** OpalSwift's own keys are a platform secret (Supabase edge secrets; `docs/deployment/SHARED-SECRETS.md` if it ever has a second copy). They are never stored in `tenants`.

What currently assumes Grow for platform billing:

- **App code:** none. There is no platform-subscription billing code yet; `tenants.sub_status` / `trial_ends_at` are set at sign-up or by hand.
- **`docs/plans/opalswift-billing-plan.md`:** built on Grow (partner programme, no-charge card save, receipts, break-even incl. the Grow fee). It gets rewritten for Takbull when platform billing is planned, under the one-current-copy rule.
- **`docs/plans/OPALSWIFT-ON-OPALSWIFT.md`** and **`docs/deployment/COORDINATOR-HANDOVER.md`:** a few Grow mentions, to update in the same pass.

The providers studios use for their own clients don't change.

## Open questions (for Takbull, not in the docs)

1. Fees: setup, monthly, per transaction, Bit, Apple Pay and Google Pay. The affiliate terms, and who carries chargebacks.
2. Can the owner's ID and bank details be entered on a Takbull-hosted page instead of passing through us?
3. A saved card's expiry and decline behaviour for `ChargeToken`.
4. The studio's logo on documents and payment pages (the docs only mention `ThemeId`).
5. Linking deposit and balance receipts to one invoice.
6. Allocation numbers (מספר הקצאה) on tax invoices.
7. Are payment notices retried? (Retries are documented only for account notices.)
8. Sandbox credentials and test cards.
10. Bit on a computer: does Takbull's page show Bit (for example, a QR code)? And on the card page, does `MaxNumberOfPayments` let the client choose up to that many instalments?

The sample keys in the docs' examples look like real keys. Takbull should confirm they aren't live.

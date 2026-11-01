# Offline payments ("pay at the studio") — 2026-11-01

Launch blocker 4 (docs/launch/LAUNCH-READINESS.md), PR 1 of the app thread.

## Problem

The first production tenant takes cash and bank transfers only. The public enrolment
checkout knew only card providers (default `grow`, no credentials) or `mock`, so a
parent enrolling online hit "Could not start payment", and payment reminders linked to
that same dead checkout. The admin-side offline path (`record-payment`) already worked.

## Design

- **Tenant setting.** `tenants.payment_provider = 'none'` means "no online payments".
  `tenants.offline_payment_instructions` holds the studio's own text (bank details,
  "pay the teacher at the first lesson"), editable in Admin → Setup → Settings.
  Existing tenants keep their provider; nothing changes for them.
- **Public checkout.** `create-checkout-charge` returns a charge with
  `paymentProvider: 'none'` and the instructions instead of calling a provider. The web
  app renders `OfflinePaymentPanel` (cash / bank transfer, instructions, confirm) in
  every place a card form used to appear: the enrolment stepper, the guest pay link
  (`TokenCompletionView`) and the signed-in pay page (`AuthenticatedCompletionView`).
- **Offline payment request.** New Edge Function `request-offline-payment` (same auth
  as `create-checkout`: parent session or enrolment token) writes one pending `manual`
  payment per engagement with the chosen method and audits it. The engagement stays
  `pending_payment`; the parent sees "Your place is reserved" with the instructions.
- **Admin records the money.** `record-payment` completes the pending request (status
  `succeeded`, admin as `created_by` / `approved_by`) instead of inserting a second row,
  then runs the unchanged `finalisePayment` spine. The admin "Pay now with card" option
  is hidden for offline-only studios; "send link" and "record offline payment" remain.
- **Reminders.** Day 3 / 7 dunning emails for offline-only tenants carry the
  instructions block and no pay button or link. Day 14 auto-cancel is unchanged
  (owner decision pending — see PR).
- **Monthly renewals.** `renewal-billing` skips offline-only tenants (nothing can be
  charged); the studio collects monthly amounts itself.

## Out of scope (next PRs)

- Invoicing off (`invoicing_provider = 'none'`) so recorded cash payments do not
  enqueue a tax document (PR 2).
- Legal minimum on public forms (PR 3). Custom domain (PR 4).

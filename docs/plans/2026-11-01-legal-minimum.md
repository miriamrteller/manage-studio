# Legal minimum on public forms — 2026-11-01

Launch blocker 7 (docs/launch/LAUNCH-READINESS.md), PR 3 of the app thread.
Gaps from docs/legal/APP-GAPS.md; wording from docs/legal/09-in-app-consent-texts.md §1.

## What ships

- **Per-tenant legal pages.** `tenants.privacy_policy_url`, `terms_url`, `accessibility_url`,
  `enrolment_terms_version`, editable in Admin → Setup → Settings → "Legal pages" (https only).
  The VITE_* URLs now serve the OpalSwift root site only; a tenant site never shows them.
- **Footer.** `LegalFooterLinks` shows the studio's privacy policy, enrolment terms and
  accessibility statement; hidden until the studio sets them.
- **Privacy notice at collection** (Privacy Protection Law §11): one line + link next to
  the enrolment student forms, the inquiry form, the booking details, the public quote
  actions, the public pay request and studio signup (`PrivacyNotice`).
- **Enrolment terms checkbox** before payment, unticked by default: "I have read and agree
  to the Enrolment Terms and have read the Privacy Policy". Shown in the stepper (signed-in
  parent), on the guest / admin-sent pay link and on the signed-in pay page. Required only
  when the studio published a terms URL and the engagement is a class enrolment, so
  appointments and studios without terms are unchanged.
- **Stored acceptance.** Edge Function `accept-enrolment-terms` (same auth as checkout)
  writes `engagements.terms_accepted_at / terms_version / terms_accepted_by_user_id /
  terms_accepted_by_email / terms_accepted_via` and an audit row. Idempotent.
- **Admin enrolment.** When terms are published, the admin attests "the parent agreed (on
  paper or in person)" before taking a card or cash payment in person; "send link" lets
  the parent tick the box on the link instead.
- The Hebrew photo-consent typo ("מנתן") was already fixed on `main`; nothing to change.

## Out of scope

Studio-signup Terms/DPA checkbox (signup is gated off), marketing consent, per-purpose
photo consent, quote-acceptance contract link (APP-GAPS follow-ups).

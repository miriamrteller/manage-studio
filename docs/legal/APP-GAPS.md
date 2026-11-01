# App gaps found during the legal review

These are app changes the legal drafts depend on. None of them are made in the docs PR. Each item names where the gap is in the code and which document it supports. Wording for every checkbox and line is in [09-in-app-consent-texts.md](09-in-app-consent-texts.md) and [08-marketing-consent.md](08-marketing-consent.md). Found on 2026-11-01.

## Legal links

- [ ] **Per-studio footer links.** `apps/web/src/components/LegalFooterLinks.tsx` (used in `src/layouts/AppLayout.tsx`) shows Privacy and Terms links only when `VITE_PRIVACY_POLICY_URL` / `VITE_TERMS_URL` are set. Both are unset by default, and there is one URL for every tenant.
  - Fix: store privacy-policy and enrolment-terms URLs (or the text itself) per tenant, and show them on tenant sites. Keep the env vars for the OpalSwift root site.
  - Docs: 03, 04, 07a.
- [ ] **Accessibility statement and cookie notice links** in the footer, on every page (root and tenant sites). Docs: 05, 06.

## Consent checkboxes

- [ ] **Studio signup: accept Terms and DPA.** `SignupPage`, `CreateStudioPage`, `PlatformOnboardPage` / `OperatorOnboardingWizard` have no checkbox.
  - Fix: add a required checkbox (09 §1, "Studio signup").
  - Store user, tenant, document versions, time and IP.
  - Docs: 01, 02, 04.
- [ ] **Enrolment: accept the enrolment terms and read the privacy policy.** `features/enrolment/components/EnrolmentStepper.tsx`, `StepClass.tsx` and `GuestVerifyStep.tsx` have no such checkbox; today only the waiver, guardian and guest acknowledgements exist.
  - Fix: add a required checkbox before payment (09 §1), and the same in `AdminEnrolStudentModal` (admin attests on the parent's behalf, or sends a link).
  - Store the terms version and time.
  - Docs: 03, 07a.
- [ ] **Quote acceptance (photography).** `PublicQuoteView` / `accept-quote`: link the contract (07c) and the privacy policy before the client accepts.

## Marketing consent

- [ ] **Record consent per channel, with proof.**
  - Today: only a single `leads.marketing_consent` boolean (`supabase/migrations/20260819000100_leads.sql`). Nothing on people/accounts, and nothing is collected at enrolment, booking or signup.
  - Fix: store per channel (email / SMS / WhatsApp), together with the time, source form, wording version and IP.
  - Add the opt-in (unticked) to the enrolment, inquiry (`InquirePage`), booking and signup forms.
  - Docs: 08 §3.
- [ ] **Respect consent when sending.** The notification blast composer and any marketing send must send only to opted-in recipients, per channel. Service messages are unaffected.
- [ ] **Unsubscribe.** No unsubscribe link or line exists in the email templates (`packages/shared/src/email-templates/*`) or in the SMS/WhatsApp texts.
  - Fix:
    - an unsubscribe link plus a one-click unsubscribe endpoint;
    - reply "הסר" / "STOP" handling for SMS and WhatsApp (`twilio-webhook-status` or a new inbound webhook);
    - a confirmation message;
    - the `פרסומת:` subject/message prefix on marketing only.
  - Docs: 08 §4.

## Photo / media consent

- [ ] **Consent per purpose, with time and wording version.**
  - Today: `features/people/components/ConsentFields.tsx` has two booleans (`photo_consent`, `media_consent`).
  - Fix: replace them with per-purpose options (internal use / parents' group / website and social media) plus the guardian line for minors (09 §2).
  - Store the time and wording version, and allow withdrawal from the parent portal.
- [ ] **Hebrew typo.** `apps/web/src/i18n/he.json`, `pages.people.photo_consent_label` = "אני מנתן הסכמה לצילום". It should read "אני נותן/ת הסכמה לצילום" (also check `media_consent_label`, "אני מנתן הסכמה להשתמש בתוכן מדיה").
- [ ] **Split the seed waiver.** The `consent_templates` seed "Health & Liability Waiver" (`supabase/seed.sql`, id `…0801`) bundles the health declaration, a release of liability and indemnity, and a photo/media release.
  - Fix: replace it with the health declaration (07b).
  - Move photo consent to the separate opt-in above.
  - The release clause needs the lawyer's decision.
- [ ] **Photography portfolio opt-in.** Add a separate, optional checkbox under the job contract (07c §6). Store it with the job, and let it be withdrawn later.

## Privacy notice on public forms

- [ ] **Privacy link next to every form that collects personal data.** Missing today on:
  - `InquirePage`;
  - `BookingPage`;
  - `QuotePage` / `PublicQuoteView`;
  - `PayRequestPage`;
  - the enrolment steps;
  - `SignupPage`.
  - Fix: add one line, "We use your details to … — Privacy Policy", linking the tenant's policy (or OpalSwift's on the root site).
  - Basis: Privacy Protection Law §11.
  - Docs: 03, 04.

## Related (from the security procedure, doc 11)

- [ ] App-level MFA for studio admins.
- [ ] 24-month retention for logs of access to sensitive records (extend `audit_log`, or export the Supabase logs).
- [ ] Full data export for a studio (today only finance, waivers and schedule exports exist). The Terms and DPA promise it "on request".
- [ ] Health data visible only to studio admins and the student's assigned teachers: check the RLS and the UI.

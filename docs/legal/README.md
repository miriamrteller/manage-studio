# Legal documents — drafts

> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> **טיוטה, לא ייעוץ משפטי. יש להעביר לבדיקת עורך/ת דין ישראלי/ת לפני פרסום.**

Drafts of the documents OpalSwift and its first studios need to launch in Israel. Each long document has an English (`.en.md`) and a Hebrew (`.he.md`) file; the two short-text documents (08, 09) are bilingual in one file. Hebrew is the version most end users will read. `[[…]]` marks something the owner, a studio, the lawyer or the accountant must fill in or confirm. Every document ends with the sources it relies on; anything we could not confirm from a primary source says "verify".

Research date: 2026-11-01. Official legal-text sites (Nevo, Wikisource) could not be opened from the drafting environment, so section numbers were checked against secondary sources (law-firm and government summaries) and flagged where uncertain.

## The documents

| # | Document | Files | Who it is between / for | Where it is shown in the app |
|---|---|---|---|---|
| 1 | Platform Terms of Service | [en](01-platform-terms.en.md) · [he](01-platform-terms.he.md) | OpalSwift ↔ studio | Studio signup (`CreateStudioPage`, `PlatformOnboardPage`, `OperatorOnboardingWizard`) as a required checkbox; footer link on the OpalSwift root site (`VITE_TERMS_URL`) |
| 2 | Data Processing Agreement | [en](02-dpa.en.md) · [he](02-dpa.he.md) | OpalSwift (holder) ↔ studio (controller) | Same checkbox as #1; link in Settings → Security/Billing |
| 3 | Studio Privacy Policy (template, dance / photography variants) | [en](03-studio-privacy-policy.en.md) · [he](03-studio-privacy-policy.he.md) | Studio → its clients | Footer on each tenant site; linked next to every form that collects personal data (see below) |
| 4 | OpalSwift Privacy Policy | [en](04-opalswift-privacy-policy.en.md) · [he](04-opalswift-privacy-policy.he.md) | OpalSwift → studio admins, visitors | Footer on `opalswift.com` (`VITE_PRIVACY_POLICY_URL`); studio signup |
| 5 | Cookie & local storage notice | [en](05-cookie-storage-notice.en.md) · [he](05-cookie-storage-notice.he.md) | Everyone | Footer link "Cookies / עוגיות"; linked from both privacy policies. No banner needed (essential storage only) |
| 6 | Accessibility Statement | [en](06-accessibility-statement.en.md) · [he](06-accessibility-statement.he.md) | Everyone | Footer link "הצהרת נגישות" on every page (root and tenant sites) |
| 7a | Dance enrolment terms | [en](07a-dance-enrolment-terms.en.md) · [he](07a-dance-enrolment-terms.he.md) | Dance school ↔ parent / adult student | Enrolment flow (`EnrolmentStepper`, before payment), admin enrol (`AdminEnrolStudentModal`), parent portal |
| 7b | Health declaration (child / adult) | [en](07b-health-declaration.en.md) · [he](07b-health-declaration.he.md) | Dance school ↔ parent / adult student | As the active `consent_templates` row used by the waiver step (`WaiverStep`, `accept-waiver`) |
| 7c | Photography services contract | [en](07c-photography-contract.en.md) · [he](07c-photography-contract.he.md) | Photographer ↔ client | As the job-contract `consent_templates` row (`JobContractCard`, `send-job-contract-link`, `job-contract-pdf-generate`); linked from the public quote (`PublicQuoteView`) |
| 8 | Marketing consent wording + unsubscribe lines | [en+he](08-marketing-consent.md) | Studio/OpalSwift → recipients | Opt-in on enrolment, inquiry (`InquirePage`), booking, signup; footer of marketing emails / blast composer; SMS/WhatsApp templates |
| 9 | Short in-app consent texts | [en+he](09-in-app-consent-texts.md) | — | Enrolment checkbox, photo/media consent (`ConsentFields`), marketing opt-in, health attestation, e-signature attestation (`WaiverStep`) |
| 10 | Owner's launch checklist (internal) | [en](10-owner-checklist.en.md) · [he](10-owner-checklist.he.md) | Owner | Not shown in app |
| 11 | Information Security Procedure (internal) | [en](11-security-procedure.en.md) · [he](11-security-procedure.he.md) | Owner / anyone with access | Not shown in app; summary on request to studios |

## What the app shows today (found in `apps/web`, no code changed in this PR)

| Item | Where | Finding | Recommendation |
|---|---|---|---|
| Footer legal links | `src/components/LegalFooterLinks.tsx`, used in `src/layouts/AppLayout.tsx` | Shows "Privacy Policy" / "Terms of Service" only if `VITE_PRIVACY_POLICY_URL` / `VITE_TERMS_URL` are set; both are **unset by default**, so no links appear. One URL for all tenants | Set the env vars for the root site; add **per-tenant** privacy/terms URLs (each studio has its own policy, #3/#7); add Accessibility Statement and Cookie notice links |
| Studio signup | `SignupPage`, `CreateStudioPage`, `PlatformOnboardPage` | No terms / DPA / privacy checkbox | Add required checkbox (#9 §1) and store acceptance (version, time) |
| Enrolment flow | `features/enrolment/components/*` (`EnrolmentStepper`, `StepClass`, `GuestVerifyStep`, `WaiverStep`) | No enrolment-terms or privacy checkbox; only the waiver checkbox, guardian confirmation and a guest "waiver pending" acknowledgement | Add the enrolment checkbox (#9 §1) linking #7a and #3 |
| Waiver / health declaration | Seed `consent_templates` row "Health & Liability Waiver" (`supabase/seed.sql`) | Combines health declaration, **release of liability + indemnity**, emergency authorisation and a **photo/media release** in one signed text | Replace with #7b; move photo consent to the separate opt-in; review the release clause with the lawyer (Standard Contracts Law §4(1)) |
| Waiver signing texts | `src/i18n/{en,he}.json` → `enrolment.waiver_*`, `waiver_guardian_confirm` | Typed name + checkbox + guardian confirmation; evidence stored (snapshot, hashes, HMAC, IP, UA, optional OTP) | Use the attestation in #9 §5; it already matches the evidence the app records |
| Photo / media consent | `features/people/components/ConsentFields.tsx`; i18n `pages.people.photo_consent_label` ("אני מנתן הסכמה לצילום" — Hebrew typo, should be "אני נותן/ת") and `media_consent_label` | Two booleans, no purpose, no timestamp/wording version; Hebrew label has a typo | Per-purpose options (#9 §2), store time + wording version, fix the Hebrew |
| Marketing consent | `leads.marketing_consent` (migration `20260819000100_leads.sql`), lead ingest defaults to `false` | Single boolean on leads only; no per-channel flag, no timestamp/source/wording; not collected on enrolment/booking; no unsubscribe link/line found in email templates | Per-channel consent with proof (#8 §3); add the "פרסומת" prefix and unsubscribe footer to marketing emails/blasts (#8 §4) |
| Photography contract | `supabase/functions/_shared/job-contract.ts` merge fields | Contract text comes from the tenant's template | Load #7c as the template |
| Inquiry / booking / quote / pay forms | `InquirePage`, `BookingPage`, `QuotePage`/`PublicQuoteView`, `PayRequestPage` | No privacy-notice link next to the form | Add a one-line notice + link to #3 (Privacy Law §11) |
| Accessibility statement | — | None in the app | Publish #6 and link in footer |
| Trackers | `package.json`, `index.html`, `src/lib/monitoring.ts` | No analytics/trackers; fonts self-hosted; Sentry hook present but not installed (Sentry, EU region, now approved and in the DPA) | #5 lists Sentry's session-storage id; re-check after Sentry (PR #104) is installed |
| Data export | `features/finance-admin/lib/csvExport.ts`, `WaiversPage`, `ScheduleExport` | Exports exist for finance, waivers and schedules only | Terms/DPA promise a full export **on request**; consider a one-click full export |

The same gaps as a schedulable checklist: [APP-GAPS.md](APP-GAPS.md).

## Placeholders the owner must fill

**OpalSwift (docs 1, 2, 4, 5, 6, 11):** legal name; business status and number (today: individual, not a registered עוסק); address; support email and channel/hours; privacy email; legal-notices email; city for jurisdiction; plan/price/billing period and payment method (or "free during beta"); notice periods (30 days defaults), export window (30 days) and full-export turnaround (14 days), incident notice time to studios (24 h); R2 bucket location/jurisdiction; Cloudflare bot cookie check; account-data and audit-log retention; accessibility coordinator name/phone/email/address; date of manual screen-reader test; security-procedure approver, contractors list, second offline location for the backup key, restore-test interval, storage-files-in-backup check; PPA reporting link; current VAT-exemption threshold (accountant).

**Each studio (docs 3, 7a, 7b):** studio name and legal name, business status/number, address, phone, email, privacy contact; payment and invoicing providers used; retention periods (records, health declarations, signed docs, consent proof); season name and dates, number of lessons, holidays, performance/costume fees; prices, registration fee, sibling discount, VAT wording, payment methods and dates; late-payment and make-up rules; collection-age rule; insurance details; dress code, watching/filming rules; health-declaration retention and whether it is mandatory; physical accessibility of the premises.

**Creative Ballet Academy specifically:** the `[[RECEIPTS]]` line in 7a cannot be published until the school is registered and issues receipts.

**Photographer (docs 3B, 7c):** legal name, עוסק type and number, address, contacts; package contents, extras prices, travel radius; deposit %, balance timing, cancellation schedule amounts and day limits, rescheduling window; delivery days, gallery service, gallery and archive retention; raw files policy; credit handle; backup practice; force-majeure re-booking window; city for jurisdiction.

## Questions for the lawyer (or owner decisions)

1. **Consumer cancellation for classes:** does the §14C(d) exception (leisure/entertainment services starting within 7 days) apply to dance classes and to photography services? Does reg. 2 of the 2010 Cancellation Regulations contain a specific rule for courses/classes bought in person? How may a season discount be adjusted on early cancellation of a continuing service (§13D)?
2. **Liability waiver:** can the studio keep any release/assumption-of-risk wording for children's classes, given Standard Contracts Law §4(1) and a parent's ability to waive a minor's claims? (Recommended: drop the release.)
3. **Sports Law / Gyms Law:** confirm neither applies to non-competitive dance classes; and whether entering students in competitions changes that.
4. **Sex-offender employment law:** does it apply to a private dance school, and must police approvals be obtained for each teacher/assistant?
5. **Security level and officers:** confirm medium level (regulation 1 / First Schedule), and that no DPO (§17B1), data security officer (§17B) or database registration/notification is required for OpalSwift or the studios at current scale.
6. **Holder vs. studio-chosen integrations:** are payment/invoicing providers the studio's own processors (as the DPA says), or OpalSwift sub-processors?
7. **Transfers abroad:** exact sub-regulation for EU/Convention 108 countries; whether Supabase, Cloudflare, GitHub, Twilio and Google DPAs meet the PPA's 13 Apr 2026 opinion on reg. 2(4).
8. **Breach reporting:** confirm one report can cover controller and holder; and the reporting channel.
9. **Response period** for access/correction requests after Amendment 13.
10. **E-signature:** is a typed-name signature sufficient for the copyright clause in the photography contract (Copyright Law §37 written form), and confirm current Electronic Signature Law §§2–3A after the 2018 amendment.
11. **Retention periods:** limitation periods for keeping signed waivers, health declarations and contracts vs. deletion requests.
12. **Accessibility exemption:** the small-business turnover thresholds are reported inconsistently (₪100,000 vs. ₪1,000,000); confirm, though publishing the statement is recommended anyway.
13. **Spam law:** current case law on WhatsApp; whether the "פרסומת" marking must be in Hebrew in English emails; unsubscribe timing; whether a recital/performance notice to enrolled families is a service message.
14. **Platform liability cap** and whether a studio that is an unregistered individual is a "customer" under the Standard Contracts Law.
15. **Owner decision:** OpalSwift cannot charge fees until it is a registered business — keep the platform free until then? Language precedence (Hebrew governs?).
16. **Tax (accountant):** past ballet payments received without receipts; עוסק type for OpalSwift and the school.

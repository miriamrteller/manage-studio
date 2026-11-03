> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> OpalSwift's own statement (opalswift.com and the platform). The studio template with per-studio details is [06-accessibility-statement.en.md](06-accessibility-statement.en.md). Hebrew: [06-accessibility-statement.opalswift.he.md](06-accessibility-statement.opalswift.he.md).

# Accessibility Statement

Last updated: 2 November 2026 · Statement applies to: opalswift.com and the OpalSwift platform

OpalSwift wants everyone, including people with disabilities, to be able to enrol, book, sign and pay online independently. We aim to meet Israeli Standard **IS 5568** at level **AA** (based on WCAG 2.0 AA), and we design against **WCAG 2.1 AA**.

## What we have done

- Full Hebrew (right-to-left) and English interfaces, with correct page language and direction set for screen readers.
- Keyboard operation: all main actions can be done without a mouse; visible focus indicator; dialogs close with Escape and keep focus inside while open.
- Form fields have labels; errors are announced to screen readers.
- Meaningful headings and page landmarks (header, navigation, main).
- Text contrast checked to the AA ratio; text can be enlarged with browser zoom without loss of content.
- No auto-playing media. Where there is a time limit (one-time sign-in codes, temporary booking holds, the waiver reading confirmation) you can resend or restart it, and an enrolment in progress is kept in your browser tab until you close it, so you can continue after signing in again.

## How we test

- **Automated checks run in our build pipeline (CI)** whenever the user interface changes: axe-core accessibility scans plus targeted tests for headings, form labels, keyboard navigation, focus visibility, dialogs, landmarks, and page language/direction. The build fails on critical violations and on colour-contrast failures. Code is also checked with accessibility lint rules (eslint-plugin-jsx-a11y).
- **Honest scope:** the automated tests currently cover the main entry pages (home and sign-in). They do not prove every page meets every WCAG 2.1 AA criterion, and automated tools catch only part of the issues. **Manual testing with a screen reader (NVDA in Hebrew) is planned / was done on not yet done.**

## Known limitations

- **Payment forms** are provided by the studio's payment provider (for example Grow/Meshulam, YPay, Stripe) inside or outside our pages; their accessibility is the provider's responsibility.
- **Photo galleries** are hosted on external services chosen by the photographer.
- **PDF copies** of signed waivers and contracts may not be fully accessible to screen readers. The same text is available as a web page before signing, and we will send an accessible version on request.
- **Calendar views** (drag-and-drop scheduling for admins) may be harder to use with a keyboard or screen reader; a list view and standard forms are available for the same records.
- Content written by studios (class descriptions, images) depends on the studio adding text alternatives.

We are working to fix these. If something does not work for you, please tell us and we will help you complete the action another way (by phone or email).

## Accessibility coordinator

- Name: OpalSwift accessibility contact
- Phone: coming soon; in the meantime, please contact us by email · Email: hello@opalswift.com
- Address: Jerusalem, Israel

We aim to reply within 5 business days.

Date of last accessibility review: November 2026.

---

### Awaiting lawyer review (see [AWAITING-LAWYER-REVIEW](AWAITING-LAWYER-REVIEW.md))
- [[LAWYER: confirm]] Operator identity removed at the owner's request; OpalSwift is about to be registered. Add the registered business name and number here on registration.

### Sources relied on
- Equal Rights for Persons with Disabilities Law 5758-1998.
- Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations 5773-2013, reg. 35 (internet services must meet IS 5568 at level AA) and the accessibility-statement requirement (reg. 35, reported as 35ה) ([[LAWYER: confirm sub-regulation and the content items required in the statement]]).
- Israeli Standard IS 5568 (based on W3C WCAG 2.0).
- **Exemptions:** the regulations contain exemptions for small businesses (by turnover) and for sites launched before the regulations; secondary sources disagree on the thresholds (figures of ₪100,000 and ₪1,000,000 are both reported). *Verify with lawyer before relying on any exemption — recommended to publish the statement regardless.*
- The CI facts above come from `.github/workflows/ci.yml` (job `accessibility`) and `apps/web/e2e/accessibility-compliance.spec.ts`.

**For the lawyer.** A phone number must be added to the coordinator details (Service Accessibility Regulations); the statement says "coming soon" until the owner's virtual number is live.

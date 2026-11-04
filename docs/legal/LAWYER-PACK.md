# Lawyer pack / חבילה לעו"ד

> One page for the lawyer who reviews a studio's documents. All documents are **drafts, not legal advice**. Hebrew is what users read; **the English version prevails** (owner decision, see OPEN-QUESTIONS R14). OpalSwift is a free beta and will register as an עוסק before any paid service.

**Read first:** [OPEN-QUESTIONS](OPEN-QUESTIONS.md) — the questions still open, and the research answers the documents rely on, each with a confidence level. Please confirm or correct those answers; the documents follow them.

## Reading order

| # | Document | English | Hebrew | Dance school | Photographer |
|---|---|---|---|---|---|
| 1 | Platform terms (OpalSwift ↔ studio) | [en](01-platform-terms.en.md) | [he](01-platform-terms.he.md) | ✓ | ✓ |
| 2 | Data processing agreement | [en](02-dpa.en.md) | [he](02-dpa.he.md) | ✓ | ✓ |
| 3 | Studio privacy policy (variant A dance, B photographer) | [en](03-studio-privacy-policy.en.md) | [he](03-studio-privacy-policy.he.md) | ✓ | ✓ |
| 4 | Class/course enrolment terms | [en](07a-class-enrolment-terms.en.md) | [he](07a-class-enrolment-terms.he.md) | ✓ | — |
| 5 | Health declaration, child (sport-neutral) | [en](07b-health-declaration-child.en.md) | [he](07b-health-declaration-child.he.md) | ✓ | — |
| 5b | Health declaration, adult | [en](07b-health-declaration-adult.en.md) | [he](07b-health-declaration-adult.he.md) | ✓ | — |
| 6 | Service agreement (base, any provider) | [en](07c-service-agreement.en.md) | [he](07c-service-agreement.he.md) | — | ✓ |
| 6a | Add-on: photography | [en](07c-addon-photographer.en.md) | [he](07c-addon-photographer.he.md) | — | ✓ |
| 6b | Add-on: beauty and treatments | [en](07c-addon-beautician.en.md) | [he](07c-addon-beautician.he.md) | — | — |
| 6c | Add-on: coaching and tutoring | [en](07c-addon-coaching.en.md) | [he](07c-addon-coaching.he.md) | — | — |
| 7 | Marketing consent and unsubscribe | [he + en](08-marketing-consent.md) | | ✓ | ✓ |
| 8 | Short in-app consent texts (checkboxes, signatures) | [he + en](09-in-app-consent-texts.md) | | ✓ | ✓ |
| 9 | Cookie and storage notice | [en](05-cookie-storage-notice.en.md) | [he](05-cookie-storage-notice.he.md) | ✓ | ✓ |
| 10 | Accessibility statement | [en](06-accessibility-statement.en.md) | [he](06-accessibility-statement.he.md) | ✓ | ✓ |
| 11 | Security procedure (internal) | [en](11-security-procedure.en.md) | [he](11-security-procedure.he.md) | ✓ | ✓ |
| 12 | Insurance guidance | [he + en](12-insurance.md) | | ✓ | ✓ |

A generic studio (classes, workshops) uses the dance list, with the enrolment terms minus the dance-specific parts and a health declaration only if the activity is physical.

## Which template for which studio

| Studio type (app skin) | Enrolment / agreement | Health declaration | Add-on |
|---|---|---|---|
| Dance, martial arts, gym, yoga, swimming, team sports (`dance-studio`, `generic`) | 07a enrolment terms | 07b child and/or adult, by participant age (both for mixed studios) | — |
| Photographer (`photographer`) | 07c service agreement | — | 07c-addon-photographer |
| Beauty and treatments (`beautician`) | 07c service agreement | — | 07c-addon-beautician |
| Tutor, coach, personal trainer (no skin yet) | 07c service agreement | 07b for physical training | 07c-addon-coaching |
| Any other service (`generic`, job-based) | 07c service agreement | 07b if the activity is physical | — |

The base agreement and its add-on are one signed document; the health declaration is always a separate form.

## What the app does with them

- 1 and 2: accepted by the studio admin at signup (one checkbox, both documents).
- 3, 4 and 10: generated per studio from its details and published at `/legal/…`; 4 is accepted before payment at enrolment.
- 5 and 6: signed in the app as `consent_templates` (the base agreement plus the skin's add-on; the child or adult health declaration by age); the app keeps the signed text, time, and address.
- 7 and 8: the exact wording and version of every consent is stored with the consent.
- Sources are listed at the end of each document. Anything unconfirmed says "verify". No case law is cited anywhere.

## Beta launch: legal checklist

**Before inviting any studio**
- Platform terms + DPA (1, 2) accepted at studio signup: one checkbox, recorded with the document version. Fill the `[[…]]` placeholders first: support email, legal-notices email, city for jurisdiction, the free-plan liability amount.
- OpalSwift privacy policy (doc 04) and accessibility statement (doc 10) live from the root-site footer; cookie notice (doc 9) linked.
- The beta notice in the terms (free; as is / as available; export your data; how the beta ends).
- Owner's own two-step sign-in on; the security procedure (11) followed.

**Before a studio goes live to its clients** (the app walks the studio through this; see [TENANT-LEGAL-SETUP](TENANT-LEGAL-SETUP.md))
- Studio privacy policy published; enrolment terms or photography contract attached; consents in place.

**Can wait**
- Lawyer review of the whole pack (the app reminds every studio after it publishes).
- OpalSwift's עוסק registration: needed before any paid plan, not for the free beta ([BUSINESS-REGISTRATION](BUSINESS-REGISTRATION.md)).
- Insurance (12), the SMS "STOP" reply webhook (the unsubscribe link already works), and whether two-step sign-in becomes mandatory for studio admins.

## Where the answers go

Please answer in writing per question number. The owner records each answer in the OPEN-QUESTIONS resolved table and updates the documents; the app then shows the studio a new version to re-publish.

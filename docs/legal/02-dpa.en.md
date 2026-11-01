> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> Hebrew version: [02-dpa.he.md](02-dpa.he.md).

# Data Processing Agreement (DPA)

Between the **Studio** (the controller, בעל השליטה במאגר) and **[[OPALSWIFT LEGAL NAME]]** ("**OpalSwift**", the holder / processor, מחזיק). Part of the [Platform Terms](01-platform-terms.en.md). Last updated: [[DATE]].

This DPA is written to meet the Privacy Protection Law 5741-1981 as amended by Amendment 13 (in force 14 August 2025) and regulation 15 of the Privacy Protection (Data Security) Regulations 5777-2017 (outsourcing to a holder).

## 1. Roles

- The Studio decides why and how its clients' data is processed and is the controller of its database.
- OpalSwift processes that data only to provide the Platform and only on the Studio's documented instructions (these terms, the Platform settings the Studio chooses, and written requests). If OpalSwift thinks an instruction breaks the law, it will say so and may refuse it.
- OpalSwift will not use Studio data for its own purposes, sell it, or combine it with other studios' data, except aggregated, non-identifying service statistics (e.g. counts of enrolments) used to run and improve the Platform.

## 2. What data, whose, and why

| Item | Detail |
|---|---|
| Data subjects | Studio clients: parents/guardians, students (including **minors**), adult students, photography clients, leads, staff/teachers of the Studio |
| Data types | Name, contact details (email, phone, WhatsApp), address, date of birth / age, family links, class/booking/job records, attendance, payment records (amounts, status, provider references — **not** full card numbers), invoices metadata, signed waivers/contracts (typed name, timestamp, IP address, browser, document hash), messages sent, marketing-consent flags, image/gallery links, files uploaded by the Studio |
| Sensitive data | **Health declarations, medical notes and allergies** (dance); **photos of children** (both). Health data is "information of special sensitivity" under the law as amended. |
| Purposes | Enrolment, scheduling, billing and payment requests, sending service messages, signing and storing waivers/contracts, delivering galleries, customer support, security, backup |
| Systems | OpalSwift web app, Supabase (database, auth, file storage, server functions), Cloudflare (hosting, email sending, encrypted backups), and the integrations listed in section 4 |
| Processing actions | Collect via forms, store, display to authorised Studio users, send messages, export, delete |
| Duration | For the life of the Studio account plus the export and deletion periods in section 9 |

## 3. Security

- OpalSwift applies the security measures in its **Information Security Procedure** ([11-security-procedure.en.md](11-security-procedure.en.md)) and at least the measures required for a database at the **medium security level** (רמת אבטחה בינונית) under the Data Security Regulations, because Studio databases may hold health data. The Studio is responsible for the level that applies to its own database and for its own users, devices and passwords. ([[LAWYER: confirm level per regulation 1 and the First Schedule]].)
- Key measures: tenant isolation enforced in the database (row-level security), least-privilege server functions, encryption in transit (HTTPS/TLS) and at rest (provider-level), separate encryption of provider credentials, signed and sealed waiver records, an audit log of sensitive actions, nightly encrypted backups, and restricted administrative access.
- People who access Studio data on OpalSwift's behalf are bound by confidentiality and receive only the access they need. (A regulation 15 agreement item.)

## 4. Sub-processors

The Studio authorises OpalSwift to use these sub-processors. OpalSwift will give at least [[30]] days' notice of a new sub-processor (by email or in-app). The Studio may object on reasonable grounds; if no solution is found the Studio may end the agreement and get a pro-rata refund.

| Sub-processor | Service | Data location | Notes |
|---|---|---|---|
| Supabase Inc. | Database, authentication, file storage, edge functions | EU — Frankfurt, Germany (eu-central-1) | Company based in the USA; support access may be from outside the EU ([[CHECK Supabase DPA]]) |
| Cloudflare, Inc. | App hosting (Workers), email sending, encrypted database backups (R2) | Global edge network; R2 bucket location [[R2 LOCATION/JURISDICTION]] | Backups are GPG-encrypted before upload |
| GitHub, Inc. (Microsoft) | Runs the nightly backup job (the database dump is encrypted on the job runner before upload), source code | USA / global | No production data is stored in the repository |
| Twilio Inc. | SMS, WhatsApp messages, one-time codes (only if enabled) | USA / global | Phone number and message content |
| Google LLC | Google Calendar sync (only if the Studio connects it) | USA / global | Appointment time, title, and attendee details the Studio chooses to sync |
| Functional Software, Inc. (dba Sentry) | Application error monitoring and in-app problem reports from studio admins | EU data region (Frankfurt, Germany); US entity may access for support (Sentry DPA / SCCs) | Stack traces, browser/OS, route template, app version, internal user and tenant IDs, problem-report text and reporter name/email if given. Configured to exclude IP addresses, names, phone numbers, request/response bodies, payment, health and children's data, URL tokens; no session replay or screenshots. Retention per Sentry plan ([[VERIFY — ~30 days]]) |

**Integrations chosen by the Studio** (payment and invoicing providers such as YPay, Grow/Meshulam, Stripe, Tranzila, iCount, Green Invoice/Morning, Yesh Invoice, Invoice4U): the Studio contracts with these providers directly using its own account. OpalSwift passes data to them on the Studio's instruction. They act for the Studio, not as OpalSwift sub-processors. ([[LAWYER: confirm this characterisation]].)

OpalSwift requires each sub-processor to protect the data to a standard not lower than this DPA and remains responsible to the Studio for them.

## 5. Transfers outside Israel

Studio data is stored in the EU (Germany) and may be accessed from the USA or other countries by the providers above. OpalSwift relies on the Privacy Protection (Transfer of Data to Databases Abroad) Regulations 5761-2001:

- **EU storage (Germany):** regulation 2 allows transfer to a country whose law provides protection not lower than Israeli law, including, per the regulations, countries party to the Council of Europe Convention 108. Germany is a party. ([[LAWYER: confirm the exact sub-regulation, e.g. 2(8)]].)
- **USA and other countries:** the recipient's written undertaking under regulation 2(4) (the provider's DPA / contractual terms), together with the recipient's undertaking under regulation 3 not to transfer the data onward except as allowed. The Privacy Protection Authority published a final opinion on regulation 2(4) on 13 April 2026 requiring substantive undertakings, including toward data subjects. ([[LAWYER: check each provider's DPA against that opinion]].)

## 6. Help with data subject requests

If a client asks OpalSwift directly to see, correct or delete their data, OpalSwift will pass the request to the Studio within [[5]] business days and will not answer it itself unless the Studio asks. The Platform lets the Studio view, edit, export and delete records; OpalSwift will help with anything the Studio cannot do in the app.

## 7. Security incidents

- OpalSwift will tell the Studio **without undue delay and in any case within [[24]] hours** after it learns of a security incident affecting Studio data, with what is known: what happened, which data and people, what has been done, and a contact person. Updates follow as more is known.
- OpalSwift will help the Studio meet its obligations, including the duty to notify the Privacy Protection Authority immediately of a **severe security incident** (regulation 11(d)) and any notice to data subjects the Authority orders. Where the incident affects many studios, OpalSwift may report to the Authority itself and tell each Studio; per published guidance, a single report can cover both controller and holder ([[LAWYER: confirm]]).
- OpalSwift keeps a record of security incidents and reviews them at least once a year.

## 8. Reporting and audit

- OpalSwift will report to the Studio **at least once a year** on how it is meeting this DPA and the Data Security Regulations, and on any incidents (regulation 15).
- On reasonable notice the Studio may ask questions or request evidence (e.g. this procedure, sub-processor list, audit results). Audits will be done in a way that does not expose other studios' data.

## 9. End of service: return and deletion

- During the account and for **[[30]] days** after it ends, the Studio can export its data (in-app exports where available; a full CSV/JSON export plus signed PDFs on request within [[14]] days).
- After that, OpalSwift deletes Studio data from the live system within **[[30]] days**. Backup copies expire automatically: nightly backups after **30 days** and monthly backups after **~13 months** (current backup retention). Until they expire they stay encrypted and are used only for disaster recovery.
- Signed waiver/contract records are tamper-sealed and are not editable; they are deleted with the rest of the Studio's data unless the Studio exports them or the law requires otherwise.
- OpalSwift will confirm deletion in writing on request.

## 10. Other

If this DPA and the Platform Terms conflict, this DPA governs on data-protection matters. The liability terms of the Platform Terms apply. Israeli law applies.

---

### Sources relied on
- Privacy Protection Law 5741-1981, as amended by Amendment 13 (Privacy Protection (Amendment No. 13) Law 5784-2024, in force 14 August 2025): definitions of controller and holder (מחזיק); §17 (holder's duty for security); "information of special sensitivity" (includes health data). *Section numbers after Amendment 13: verify with lawyer.*
- Privacy Protection (Data Security) Regulations 5777-2017: regulation 1 & First Schedule (security levels); reg. 11 (security incidents, reporting severe incidents to the Authority); reg. 15 (outsourcing: required agreement items, holder reporting at least annually).
- Privacy Protection (Transfer of Data to Databases Abroad) Regulations 5761-2001: reg. 2 (permitted bases, incl. reg. 2(4) undertaking) and reg. 3 (recipient undertaking, no onward transfer).
- Privacy Protection Authority, final opinion on transfers under reg. 2(4), published 13 April 2026 (as reported by Israeli law-firm updates; read the original before relying on it).

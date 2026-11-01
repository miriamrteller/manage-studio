> **Draft, not legal advice. Have an Israeli lawyer review before relying on it.** Tax items: check with an accountant (רו"ח / יועץ מס).
> Hebrew version: [10-owner-checklist.he.md](10-owner-checklist.he.md). Internal.

# Launch Checklist for the Owner

Status key: ☐ to do · ◐ in progress · ☑ done. "Verify" = ask the lawyer/accountant.

## A. Privacy law (Amendment 13, in force 14 Aug 2025)

1. ☐ **Database registration — probably not required.** After Amendment 13, registration is required mainly for public bodies and data brokers (databases whose main purpose is passing data to others, above 10,000 people). Controllers of databases with *information of special sensitivity* on more than **100,000** people must notify the Authority instead. OpalSwift, the ballet school and the photographer are far below this. **Verify** and re-check yearly.
2. ☐ **Privacy protection officer (DPO, §17B1) — probably not required now.** Required for public bodies, data brokers, and bodies whose main activities involve systematic monitoring or processing special-sensitivity data **on a significant scale**. A small dance school with health declarations, and OpalSwift at its current size, are unlikely to qualify. **Verify**, and re-check as OpalSwift grows (many studios × health data could become "significant scale"). The Authority gave an initial grace period to 31 Oct 2025 for DPO appointments — that has passed.
3. ☐ **Data security officer (§17B)** — required in specific cases (e.g. holding five or more databases that require registration/notification, public bodies). Probably not. **Verify.**
4. ☐ **Database definition document** (Data Security Regulations, reg. 2) — still required for each database even without registration. OpalSwift: write one for the account database and one describing what it holds for studios. Each studio (controller) needs a short one too — OpalSwift can give a template. 
5. ☑ **Security procedure** for OpalSwift — drafted: [11-security-procedure](11-security-procedure.en.md). Fix the "known gaps" list in it.
6. ☐ **Security level** — medium (health data). Do the medium-level duties: annual incident review, training every 2 years, audit every 24 months, access logs 24 months. See doc 11.
7. ☐ **Breach reporting:** a severe security incident must be reported to the Privacy Protection Authority **immediately** (reg. 11). Save the Authority's reporting page/contact in the incident log now: [[PPA REPORTING LINK / EMAIL — get from gov.il]].
8. ☐ **Notice at collection (§11):** link the privacy policy on every form that collects data (enrolment, inquiry, booking, quote, signup). See APP-GAPS.md.
9. ☐ **Transfers abroad:** collect and file the DPAs of Supabase, Cloudflare, GitHub, Twilio, Google; check them against the PPA opinion on reg. 2(4) (13 Apr 2026). **Verify.**

## B. OpalSwift as a business

10. ☐ **Register as a business (עוסק) before charging any fees.** Open files with VAT (מע"מ), Income Tax and National Insurance (ביטוח לאומי). Choose עוסק פטור / מורשה / company with an accountant (VAT exemption threshold changes yearly: [[CURRENT THRESHOLD]]). Until then, offer the platform free (beta) — the Terms say so.
11. ☐ Fill the placeholders in the Terms, DPA and OpalSwift privacy policy (legal name, ID/business number, address, emails, city for jurisdiction, fees).
12. ☐ Have each studio **accept the Terms and DPA** when it signs up (click-accept with a record). The app has no such checkbox yet (APP-GAPS.md).
13. ☐ Consider professional liability / cyber insurance ([12-insurance](12-insurance.md)). **Verify.**

## C. Creative Ballet Academy (first tenant)

14. ☐ **Register the school as a business** before taking money: today payments are recorded manually with no tax receipts. Israeli tax rules require a receipt for every payment received by a business. Talk to an accountant now about past payments.
15. ☐ After registering:
    - choose an invoicing provider in the app (iCount, Green Invoice, Invoice4U, Yesh are integrated) and turn on automatic receipts;
    - update the legal name, business number and VAT wording in the enrolment terms, privacy policy and health declaration;
    - remove the "[[RECEIPTS]]" placeholder from the enrolment terms.
16. ☐ **Staff working with children:** check whether the Law for the Prevention of Employment of Sex Offenders in Certain Institutions 5761-2001 applies to the school; in any case, get a police approval (אישור משטרה) for every teacher/assistant who works with minors, and renew per police rules. **Verify.**
17. ☐ **Business licence** (רישוי עסקים) and premises: check with the local authority whether the studio needs a licence and whether the hall is approved for the use. **Verify.**
18. ☐ **Insurance:** third-party liability (and employer's liability if there are employees). Enrolment terms mention it.
19. ☐ Replace the seed "Health & Liability Waiver" with the [health declaration](07b-health-declaration.en.md); make photo consent separate; drop/rewrite the release-of-liability clause with the lawyer.
20. ☐ Accessibility of the hall: publish physical-accessibility details (accessibility statement section).

## D. The photographer (second tenant)

21. ☐ She must provide: legal name, ID / business number, **עוסק type** (פטור / מורשה / company — affects whether VAT is added to prices), address, phone, email.
22. ☐ YPay (or other) merchant account **in her business name**, and an invoicing provider for tax documents for deposits and balances.
23. ☐ Decide: deposit %, cancellation schedule amounts, delivery days, gallery service and retention, credit handle, portfolio policy. Fill [07c](07c-photography-contract.en.md).
24. ☐ **Copyright clause** must stay in the contract: without it, the client owns copyright in private/family commissioned photos (Copyright Law §35(b)).
25. ☐ Insurance (equipment, professional liability) — optional, recommended.

## E. All studios

26. ☐ Publish the studio privacy policy (doc 03) on the studio site and link it on forms.
27. ☐ Marketing: only to opted-in clients; mark messages "פרסומת"; working unsubscribe (doc 08).
28. ☐ Accessibility statement (doc 06) with a named coordinator.
29. ☐ Keep records: consents (with wording version and time), signed documents, payments.
30. ☐ **Lawyer review, last.** After publishing, have an Israeli lawyer review the published documents for this studio; the app reminds you in Settings → Legal until you dismiss it.

## F. Open legal questions for the lawyer

See [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

---

### Sources relied on
- Privacy Protection Law 5741-1981 as amended by Amendment 13: §8 ff. (registration / notification), §17B (data security officer), §17B1 (privacy protection officer), §11 (notice). Thresholds (10,000 / 100,000) and the DPO grace period (31 Oct 2025) are as reported by Israeli law-firm and compliance publications — verify against the official text.
- Privacy Protection (Data Security) Regulations 5777-2017: regs. 2, 4, 11, 16.
- Law for the Prevention of Employment of Sex Offenders in Certain Institutions 5761-2001.
- Copyright Law 5768-2007, §35(b).
- Income Tax Ordinance and book-keeping instructions; VAT Law 5736-1975 (receipts and registration) — details with an accountant.
- Business Licensing Law 5728-1968 — verify whether a dance studio is a licensable business.

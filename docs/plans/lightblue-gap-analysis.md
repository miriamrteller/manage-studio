# Light Blue vs. our photographer version — feature gap analysis (2026-10-30)

Light Blue (lightbluesoftware.com) is a UK desktop + cloud CRM for photographers.
This compares every Light Blue feature found on its own site with `main` at
`47a1ff5` (photographer Threads A–C merged).

**Totals (76 features):** ✅ 20 Have · 🟡 28 Partial · ❌ 23 Missing · ➖ 5 Not relevant for Israel.

What we already match well: lead capture + conversion, the shoot record and status
pipeline, quotes with optional add-ons and one-click acceptance, online contract
signing, deposit/balance pay links with reminders, the client portal, the gated
gallery link, expenses and CSV export.

The biggest gaps: no contract PDF, no receipt for offline payments on YPay,
contract and payment not part of the quote-accept flow, Google Calendar not synced
from shoots, no questionnaires, no custom workflows, tasks or editable templates.

**How the Light Blue side was researched.** This sandbox's network blocks
`www.lightbluesoftware.com`, so pages could not be fetched directly. Each feature
below comes from web-search results restricted to that domain (feature pages, help
articles, release notes, pricing). Every group cites the Light Blue pages it came
from. Some help articles are several years old; the newest source is the 2026.1
release notes (June 2026).

**Legend.** Effort: S ≤ ½ day · M 1–2 days · L 3+ days. Priority (photographer
beta): P1 must-have for paying clients · P2 soon · P3 later. Effort and priority are
given only for 🟡 and ❌.

---

## 1. Enquiries & leads

Sources: [contact forms][lb-contact], [mastering your workflow][lb-workflow],
[API parameters][lb-api], [home screen widgets][lb-widgets], [release notes][lb-rn].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Website contact form → inbox | Form submissions land in the Inbox and can create the contact, a shoot and an enquiry workflow | 🟡 | `/inquire` → `crm-lead-capture` → `leads` row + studio notification (`lead-ingest-core.ts`). The shoot is created only when the admin clicks "Convert to shoot" (`convert_lead_to_job`, `ConvertLeadPanel.tsx`). No auto-shoot, no auto follow-up | S | P3 |
| Email enquiries captured | (via contact forms / API) | ✅ | `crm-lead-ingest` (Cloudflare email worker → `leads`) | | |
| Enquiry status until confirmed / cancelled, with cancel reason | Shoot starts as Enquiry, then Confirmed or Cancelled with a reason | 🟡 | `job_details.job_status` `enquiry→booked→…→cancelled`; `leads.stage` incl. `lost` (`20261030000100_job_details.sql`, `20260819000100_leads.sql`). No lost / cancel reason field | S | P3 |
| Enquiry source tracking | Enquiry Source field on every shoot | ✅ | `leads.channel` (website / email / whatsapp / instagram / linkedin), set from `?src=` on capture links | | |
| Open enquiries to chase (dashboard widget) | Home Screen Enquiries widget | 🟡 | `/admin/leads` with `next_follow_up_at` (`LeadsList.tsx`). No dashboard widget or "due today" view | S | P3 |
| Lead intake via API / Zapier | API maps fields into shoots | 🟡 | Machine endpoint `crm-lead-ingest` (secret-auth). No public API or Zapier app | M | P3 |
| Public proposals for cold leads (2026.1) | Share a proposal template on a website; strangers book from it | ❌ | A quote needs `lead_id` or `engagement_id` (`20261030000300_quotes.sql`) | M | P3 |

## 2. Booking, scheduling & calendar sync

Sources: [scheduling calendars][lb-sched], [new online scheduling][lb-sched-new],
[scheduling requests][lb-sched-req], [diary][lb-diary], [integrations][lb-integrations],
[Zoom][lb-zoom].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Built-in diary (day / week / month / year) | Calendar of all shoots, colour-coded by shoot type | 🟡 | Dated shoots appear in the `/admin/appointments` list (any engagement with `booked_starts_at`). The admin calendar (`/classes`) is hidden for photographers. No month view of shoots | M | P2 |
| Online scheduling calendar | Clients pick a date/time; existing diary events block availability | 🟡 | `/book/:offeringId` + `BookingHoursEditor` + `useAvailableSlots`. A booking creates an engagement, not a shoot (`job_details` row is never written by `prepare-booking-checkout`), so it skips the shoot pipeline | M | P2 |
| Booking form, contract and fee at booking | Custom booking form, contract and booking fee on the scheduling page | 🟡 | `prepare-booking-checkout` takes a payment. No contract step, no custom questions | M | P2 |
| Scheduling requests to existing clients | Pre-filled booking link; result goes straight into the diary | 🟡 | `/book/:offeringId` link can be sent, but it isn't pre-filled or tied to an existing client / shoot | S | P3 |
| Publish events to Google Calendar | Events published to a Google calendar | 🟡 | `google-calendar-sync-event` exists; shoots sync only by the manual action on `/admin/appointments` (`AdminAppointmentsPage.tsx:94`). Creating or re-dating a shoot (`jobService.ts`) does not sync | S | P2 |
| Google Calendar blocks availability | Busy Google events block scheduling slots | ✅ | `google-calendar-freebusy`, `GoogleCalendarSettings.tsx` | | |
| Subscribable calendar feed (iCal) | "Subscribe in iCal" feed | 🟡 | One-off `.ics` download of the class timetable (`exportSchedule.ts`). No live feed of shoots | M | P3 |
| Zoom meeting per booking | Auto-creates Zoom meetings | ➖ | Shoots are in person; Israeli clients consult by phone or WhatsApp video | | |

## 3. Quotes / proposals

Sources: [proposals][lb-proposals], [proposal templates][lb-proposal-tpl],
[proposal booking fee & invoice options][lb-proposal-fee], [weddings proposals][lb-proposal-wed],
[release notes][lb-rn].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Packages + optional add-ons, client chooses | Client picks package and add-ons on one link | ✅ | `quote_lines.is_optional/is_selected`, `/quote/:token` (`QuotePage.tsx`), `accept_quote(p_selected_line_ids)` | | |
| Accept → booking created | Accepting books the shoot | ✅ | `accept-quote` → shoot (`job_status='booked'`) + deposit/balance `job_payment_requests` in one transaction | | |
| One flow: choose → form → sign → pay booking fee | All four steps in one client journey | 🟡 | After accepting, the contract needs the admin to click "Send contract" (`AcceptedQuotePanel.tsx`; `send-job-contract-link` needs an admin session) and the deposit link is a separate email. No form step. Gap: auto-send contract on accept and redirect the client straight to `/pay/:token` for the deposit | M | P1 |
| Proposal templates | Reusable proposal templates | ❌ | Each quote is built from scratch in `QuoteEditor.tsx` | M | P2 |
| Expiry date | Proposal expiry + `%ProposalExpiryDateTime%` tag | ✅ | `quotes.valid_until`; accept marks it `expired` after the date (Jerusalem time) | | |
| FAQs in the proposal | FAQ section on the proposal | ❌ | Quote has terms fields only (`QuoteTermsFields.tsx`) | S | P3 |

## 4. Contracts & e-signature

Sources: [online contracts][lb-contracts], [contracts overview][lb-contracts-ov],
[online contract signing][lb-contract-sign].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Email link → read and sign online on branded portal | Client clicks the link, reads and signs | ✅ | `send-job-contract-link` → `/enrol/complete` → `accept-waiver`; merge fields `{{client_name}} {{shoot_date}} {{location}} {{package}} {{price}}` rendered identically both sides; signed = `engagements.waiver_evidence_id` | | |
| Signed PDF emailed to both parties | PDF copy to client and photographer | ❌ | PDF generation deferred: `accept-waiver/index.ts:17-22` stores a sentinel path and zero hash. Neither side gets a copy | M | P1 |
| Checkboxes for specific terms | Per-term checkboxes | 🟡 | One agreement checkbox + typed name (`signature_method = 'typed_name_checkbox'`). No per-clause checkboxes | S | P3 |
| Drawn signature option | Optional drawn signature | ❌ | Typed name only (valid under the Israeli Electronic Signature Law, so low priority) | S | P3 |
| Booking fee paid at signing | Pay the fee as part of signing | 🟡 | Pay link is separate (`send-job-payment-link`). Covered by the §3 one-flow item | | |
| Thank-you redirect URL | Redirect after signing | ❌ | Fixed confirmation screen | S | P3 |
| Contract template per shoot type | (contract templates in Preferences) | 🟡 | One active consent template per tenant is "the contract" (`WaiversPage.tsx`). No per-package template | M | P2 |

## 5. Invoicing, payment schedules & online payments

Sources: [payment schedules & terms][lb-paysched], [payment schedule templates][lb-paysched-tpl],
[managing finances][lb-finance], [creating a sale][lb-sale], [online scheduling (Square)][lb-sched-new].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Online invoice payment | Stripe, Square, PayPal | ✅ | `/pay/:token` → `job-payment-request-public` → YPay hosted page (also Grow; Stripe settings exist) | | |
| Payment schedule: any number of instalments, fixed or %, dates relative to shoot | Instalments as fixed / %, due relative to invoice or shoot date | 🟡 | `job_payment_requests` rows of any amount; quick "deposit X% + balance on shoot date" (`JobPaymentRequestForm.tsx`); card instalments via `max_installments`. No saved schedule, no "N days before shoot" rule | S | P2 |
| Default payment schedule per shoot type | Schedule template per shoot type | ❌ | Not stored per package | S | P2 |
| Automatic payment reminders | Auto reminders for each instalment | ✅ | `run-job-payment-reminders` (3 days before due + one overdue), idempotent | | |
| Record offline payments | Cash / cheque / bank recorded | ✅ | `record-job-payment` + `ManualPaymentDialog.tsx` record it; the receipt (קבלה / חשבונית מס קבלה by `vat_type`) is issued through YPay's standalone `/document` and emailed to the client (Thread H, `2026-10-30-photographer-h-offline-receipts.md`) | | |
| Tax-compliant invoices (UK VAT, EN 16931 e-invoice export) | VAT invoices; EN 16931 export | ➖ | Israeli tax documents (חשבונית מס קבלה, allocation numbers) are issued by YPay / Grow / iCount / Invoice4U, not by us | | |

## 6. Client portal

Sources: [portal styling][lb-portal], [branding][lb-branding], [online contracts][lb-contracts].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Branded client-facing pages | Portal styled to match the business | ✅ | Tenant branding (`BrandingSettingsForm.tsx`) on every public page via `AppLayout` | | |
| Sign contracts in the portal | Contract signing pages | ✅ | `ClientPortal.tsx` contract card: status + "Sign now" | | |
| Pay invoices in the portal | Online invoice pages | ✅ | `ClientPortal.tsx` payments list with due / paid / receipt / refunded | | |
| Fill in forms in the portal | Online form pages | ❌ | No questionnaires (see §7) | | |

## 7. Questionnaires / forms

Sources: [forms for questionnaires][lb-forms-q], [forms overview][lb-forms], [contact forms][lb-contact].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Questionnaire form templates sent to clients | Pre-shoot forms built in Light Blue | ❌ | No form builder or form tables | L | P2 |
| Pre-fill known data; answers update the records | Prefill + import updates contact / shoot | ❌ | Depends on the item above | (incl.) | P2 |
| Forms sent automatically by workflow; publish + "submitted" emails | Workflow step emails the form on a date | ❌ | Depends on forms + workflows | (incl.) | P3 |
| Form attached to a contract | Completed during signing | ❌ | Depends on forms | S | P3 |
| Customisable website contact form | Custom fields on contact forms | 🟡 | `/inquire` has fixed fields (name, email, phone, message, interest) | S | P3 |

## 8. Workflows & automation, email templates, reminders

Sources: [workflows for automated messages][lb-wf-msg], [message templates][lb-msg-tpl],
[confirmation & reminder setup][lb-confirm], [mastering your workflow][lb-workflow].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Confirmation + reminder before the shoot | Ready-made confirmation now + reminder 1 day before | ✅ | `booking_confirmed` (on accept) + `shoot_reminder` (`run-shoot-emails`), toggle per tenant (`AutomaticEmailSettings.tsx`) | | |
| Thank-you / gallery-ready messages | (any workflow message) | ✅ | `shoot_thank_you`, `gallery_ready` in `run-shoot-emails` | | |
| Custom workflows: messages + tasks at ±N days from a key date, send time, per shoot type | Workflows per shoot type, day offsets, send time (default 9am) | 🟡 | Five fixed emails with fixed windows. No custom steps, offsets, times or per-package workflows | L | P2 |
| Editable email templates with mail-merge tags | Templates in Preferences with merge tags | 🟡 | Fixed React Email templates (he/en) pre-rendered to Deno shells; the photographer can't edit wording | M | P2 |
| Automated text messages | SMS templates with merge tags in workflows | 🟡 | WhatsApp via manual `wa.me` deep links (`jobContact.ts`, `QuoteSendPanel.tsx`). Automated WhatsApp needs a Twilio template SID per message; Twilio is used only for OTP today | M | P2 |
| Enquiry workflow (auto follow-up to new leads) | Recommended enquiry workflow | ❌ | New leads only notify the studio | S | P3 |

## 9. Galleries & delivery

Sources: [linking online galleries][lb-galleries], [Pic-Time][lb-pictime], [Pic-Time page][lb-pictime-page],
[post-production tracking][lb-postprod].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Link a shoot to its online gallery | Links to Pic-Time / ShootProof / theimagefile / GotPhoto | ✅ | `job_details.gallery_url`, released by `release_job_gallery`; client sees it only after release (`get_client_job_gallery`, `ClientJobGalleryCard.tsx`); `gallery_ready` email | | |
| Track post-production | Home screen post-production view | ✅ | `shot → editing → delivered` statuses, status filter in `JobsList.tsx` | | |
| Gallery-service API link (authorise account, auto-sync) | Account linking in Preferences | ➖ | Israeli photographers use many gallery hosts (Pixieset, Pic-Time, Google Drive); a pasted link covers them all | | |

## 10. Products / ordering

Sources: [creating a sale][lb-sale], [managing finances][lb-finance], [Pic-Time][lb-pictime],
[Pics4Schools][lb-p4s], [ProSelect import][lb-proselect].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Price lists of products / services (CSV import) | Groups of products added to quotes or sales in a few clicks | 🟡 | Packages are `offerings` (`PackageSelect.tsx`) and can be picked on quote lines. No add-on product catalogue, no CSV import | S | P2 |
| Sales records (after-shoot product sales) | Sales → invoice | ❌ | Only shoot payment requests; no product sale record | M | P3 |
| Import gallery / ProSelect / school orders as sales linked to a shoot | Pic-Time, ShootProof, ProSelect, Pics4Schools imports | ❌ | No order import | L | P3 |

## 11. Shoot management & task lists

Sources: [mastering your workflow][lb-workflow], [custom fields][lb-custom], [resources][lb-resources],
[queries][lb-queries], [home page][lb-home].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Shoot record: client, date, status, money, contract in one place | Shoot record | ✅ | `/admin/jobs/:id` (`JobDetail.tsx`: details, status, notes, contract, payments, gallery) | | |
| Shoot types (own branding, finance, workflows, wording) | Shoot types drive defaults | 🟡 | Packages exist, but carry no contract, payment schedule or email set of their own | M | P2 |
| To-do list / tasks at day offsets, assigned to staff | Workflow tasks on the to-do list | ❌ | No tasks | M | P2 |
| Custom fields on shoots / contacts | Text, amount, date fields | ❌ | Only `location` and free-text `notes` | M | P3 |
| Resources: staff, rooms, equipment | Book staff, rooms, equipment | 🟡 | `staff` table + `offerings.staff_id` from the class product; no rooms / equipment, not used on shoots | M | P3 |
| Query tool / saved filters | Query by type, status, custom fields | 🟡 | Status filter on `/admin/jobs` only | S | P3 |
| Trash / recover deleted records | Trash recovery | ❌ | Not present | S | P3 |
| Several brands in one account | Multiple brands | ❌ | One brand per studio (tenant) | L | P3 |

## 12. Reports & accounting exports

Sources: [reports][lb-reports], [charts][lb-charts], [export financial data][lb-export-fin],
[exporting information][lb-export], [Xero][lb-xero], [QuickBooks][lb-qb], [purchases][lb-purchases],
[MTD][lb-mtd], [accounting software blog][lb-acct].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Revenue reports (by product / package, by staff) + charts | Revenue by Product, charts | 🟡 | `/admin/finance` metric cards (revenue, net profit, payment count) and outstanding list (`FinanceHub.tsx`). No per-package breakdown, no charts | M | P3 |
| Aged debts (unpaid by days overdue) | Aged Debts report | 🟡 | Outstanding list on the finance hub; shoot payment requests past due aren't grouped by age | S | P2 |
| Contact financial history / best clients | Contact Financial History, top clients | ❌ | No per-client revenue report | S | P3 |
| Enquiry source conversion | Compare sources by leads and bookings | ❌ | `leads.channel` is stored but not reported | S | P3 |
| Expense (purchase) records | Purchase records, CSV import | ✅ | `/admin/finance/expenses` + categories (`ExpenseForm.tsx`) | | |
| CSV export of financial data | CSV of sales, purchases, payments | ✅ | `exportPaymentsCsv`, `exportExpensesCsv` (`finance-admin/lib/csvExport.ts`) | | |
| Mileage log | Track mileage as an expense | ➖ | Israeli self-employed claim car costs by fixed percentage, not per km; record as an expense | | |
| Xero / QuickBooks / Making Tax Digital | Accounting exports and UK MTD | ➖ | Israeli accountants work from the iCount / Grow / YPay / Invoice4U documents; MTD is UK-only | | |

## 13. Mobile app, multi-user, integrations

Sources: [mobile app][lb-mobile], [mobile invoices][lb-mobile-inv], [pricing][lb-pricing],
[resources / staff][lb-resources], [integrations][lb-integrations], [home page][lb-home].

| Feature | Light Blue | Us | Evidence / gap | Effort | Priority |
| --- | --- | --- | --- | --- | --- |
| Mobile app (iOS, works offline, publish invoices from the phone) | Free companion app | 🟡 | Responsive web app (`useIsNarrowViewport`); all admin flows work on a phone browser. No native app, no PWA / offline | L | P3 |
| Unlimited staff logins with limited access | Staff logins, access levels, tasks per person | 🟡 | Admin access is the `tenant_admin` role; no limited role for a second shooter or editor | M | P3 |
| Share an account with other photographers | Account sharing | ❌ | Not present | M | P3 |
| Zapier / public API | Zapier actions and API | ❌ | No public API | L | P3 |
| Email marketing (export to Mailchimp etc.) | Export addresses / Zapier to Mailchimp | ✅ | Built-in email blasts (`/admin/notifications`, `NotificationBlastForm.tsx`) with `marketing_consent` | | |

---

## Top 10 to build next

1. **Signed contract PDF to both sides** (§4, M, P1) — generate and store the PDF in `accept-waiver`, attach it to a confirmation email. Clients expect a copy.
2. ~~**Receipt for offline payments on YPay** (§5, M, P1)~~ — done (Thread H): YPay's standalone `/document` issues the קבלה / חשבונית מס קבלה for bank / cash payments.
3. **One-flow acceptance: accept → sign → pay deposit** (§3, M, P1) — service-side contract send on accept, then route the client straight to the deposit pay link.
4. **Auto Google Calendar sync for shoots** (§2, S, P2) — call `google-calendar-sync-event` on shoot create, re-date and cancel.
5. **Editable email templates** (§8, M, P2) — let the photographer change the subject and body of the five automatic emails, with merge tags.
6. **Admin month calendar of shoots** (§2, M, P2) — reuse the class calendar component for dated shoots.
7. **Quote templates + add-on price list** (§3, §10, M, P2) — save a quote as a template; small product catalogue for add-ons.
8. **Payment schedule template per package** (§5, S, P2) — default deposit % and "balance N days before shoot" stored on the package.
9. **Pre-shoot questionnaire** (§7, L, P2) — simple form builder, sent from the shoot, answers saved on the shoot and filled in through the portal.
10. **Shoot task list** (§11, M, P2) — per-shoot checklist from a package template, with due dates relative to the shoot date.

Next after these: automated WhatsApp messages (§8), online booking that creates a shoot (§2), aged-debts view (§12).

## Sources

All pages are on lightbluesoftware.com and were found by web search (direct fetch blocked in this environment).

[lb-home]: https://www.lightbluesoftware.com/
[lb-pricing]: https://www.lightbluesoftware.com/pricing/
[lb-rn]: https://www.lightbluesoftware.com/blog/category/release-notes/
[lb-proposals]: https://www.lightbluesoftware.com/features/proposals/
[lb-proposal-tpl]: https://www.lightbluesoftware.com/help/help-resources/how-to-set-up-a-proposal-template/
[lb-proposal-fee]: https://www.lightbluesoftware.com/help/help-resources/proposal-booking-fee-invoice-options/
[lb-proposal-wed]: https://www.lightbluesoftware.com/help/help-resources/using-proposals-for-wedding-photography/
[lb-contracts]: https://www.lightbluesoftware.com/help/help-resources/light-blues-powerful-online-contracts/
[lb-contracts-ov]: https://www.lightbluesoftware.com/help/help-resources/contracts-overview/
[lb-contract-sign]: https://www.lightbluesoftware.com/blog/2015/03/online-contract-signing/
[lb-portal]: https://www.lightbluesoftware.com/blog/2017/03/new-client-portal-styling-options-for-light-blues-online-forms-and-contracts/
[lb-branding]: https://www.lightbluesoftware.com/help/help-resources/how-to-set-up-your-branding-within-light-blue/
[lb-contact]: https://www.lightbluesoftware.com/help/help-resources/harnessing-the-power-of-contact-forms/
[lb-forms]: https://www.lightbluesoftware.com/help/help-resources/online-forms/
[lb-forms-q]: https://www.lightbluesoftware.com/help/help-resources/using-forms-questionnaires/
[lb-workflow]: https://www.lightbluesoftware.com/help/help-resources/mastering-your-workflow/
[lb-wf-msg]: https://www.lightbluesoftware.com/help/help-resources/using-workflows-to-send-automated-messages-to-your-clients/
[lb-msg-tpl]: https://www.lightbluesoftware.com/help/help-resources/using-message-templates/
[lb-confirm]: https://www.lightbluesoftware.com/help/help-resources/setting-up-simple-confirmation-reminder-messages/
[lb-api]: https://www.lightbluesoftware.com/help/help-resources/supported-api-parameters/
[lb-widgets]: https://www.lightbluesoftware.com/help/help-resources/home-screen-widget-types/
[lb-postprod]: https://www.lightbluesoftware.com/help/help-resources/tracking-your-post-production-in-the-home-screen/
[lb-custom]: https://www.lightbluesoftware.com/help/help-resources/custom-fields/
[lb-queries]: https://www.lightbluesoftware.com/help/help-resources/using-queries-to-find-information/
[lb-resources]: https://www.lightbluesoftware.com/help/help-resources/how-to-set-up-staff-equipment-room-resources/
[lb-sched]: https://www.lightbluesoftware.com/help/help-resources/scheduling-calendars/
[lb-sched-new]: https://www.lightbluesoftware.com/blog/2023/01/new-online-scheduling-features/
[lb-sched-req]: https://www.lightbluesoftware.com/help/help-resources/scheduling-requests/
[lb-diary]: https://www.lightbluesoftware.com/help/help-resources/how-to-start-using-light-blue-as-a-diary/
[lb-zoom]: https://www.lightbluesoftware.com/help/help-resources/zoom/
[lb-integrations]: https://www.lightbluesoftware.com/help/help-resources/what-other-services-can-light-blue-integrate-with/
[lb-paysched]: https://www.lightbluesoftware.com/help/help-resources/setting-up-payment-schedules-and-terms-in-light-blue/
[lb-paysched-tpl]: https://www.lightbluesoftware.com/help/help-resources/a-detailed-look-at-payment-schedule-templates/
[lb-finance]: https://www.lightbluesoftware.com/help/help-resources/using-light-blue-to-manage-your-finances/
[lb-sale]: https://www.lightbluesoftware.com/help/help-resources/creating-a-sale/
[lb-galleries]: https://www.lightbluesoftware.com/help/help-resources/linking-online-galleries/
[lb-pictime]: https://www.lightbluesoftware.com/help/help-resources/linking-pic-time/
[lb-pictime-page]: https://www.lightbluesoftware.com/pic-time
[lb-p4s]: https://www.lightbluesoftware.com/pics4schools/
[lb-proselect]: https://www.lightbluesoftware.com/blog/2019/09/save-time-by-importing-your-proselect-orders-into-light-blue/
[lb-reports]: https://www.lightbluesoftware.com/help/help-resources/light-blue-reports/
[lb-charts]: https://www.lightbluesoftware.com/help/help-resources/charts/
[lb-export-fin]: https://www.lightbluesoftware.com/help/help-resources/how-to-export-your-financial-data-from-light-blue/
[lb-export]: https://www.lightbluesoftware.com/help/help-resources/exporting-information-from-light-blue/
[lb-xero]: https://www.lightbluesoftware.com/help/help-resources/how-to-get-data-from-light-blue-to-xero/
[lb-qb]: https://www.lightbluesoftware.com/help/help-resources/how-to-get-data-from-light-blue-to-quickbooks/
[lb-purchases]: https://www.lightbluesoftware.com/help/help-resources/keeping-an-eye-on-your-profit-by-recording-your-spending-with-purchases/
[lb-mtd]: https://www.lightbluesoftware.com/help/help-resources/making-tax-digital-mtd/
[lb-acct]: https://www.lightbluesoftware.com/blog/2022/11/accounting-software-for-photographers/
[lb-mobile]: https://www.lightbluesoftware.com/help/help-resources/setting-up-the-light-blue-mobile-app/
[lb-mobile-inv]: https://www.lightbluesoftware.com/help/help-resources/publishing-invoices-for-online-payment-from-the-light-blue-mobile-app/

- Home: <https://www.lightbluesoftware.com/> · Pricing: <https://www.lightbluesoftware.com/pricing/> · Release notes (incl. 2026.1): <https://www.lightbluesoftware.com/blog/category/release-notes/>
- Proposals: <https://www.lightbluesoftware.com/features/proposals/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-set-up-a-proposal-template/>, <https://www.lightbluesoftware.com/help/help-resources/proposal-booking-fee-invoice-options/>, <https://www.lightbluesoftware.com/help/help-resources/using-proposals-for-wedding-photography/>
- Contracts: <https://www.lightbluesoftware.com/help/help-resources/light-blues-powerful-online-contracts/>, <https://www.lightbluesoftware.com/help/help-resources/contracts-overview/>, <https://www.lightbluesoftware.com/blog/2015/03/online-contract-signing/>
- Portal & branding: <https://www.lightbluesoftware.com/blog/2017/03/new-client-portal-styling-options-for-light-blues-online-forms-and-contracts/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-set-up-your-branding-within-light-blue/>
- Forms: <https://www.lightbluesoftware.com/help/help-resources/harnessing-the-power-of-contact-forms/>, <https://www.lightbluesoftware.com/help/help-resources/online-forms/>, <https://www.lightbluesoftware.com/help/help-resources/using-forms-questionnaires/>
- Workflows & messages: <https://www.lightbluesoftware.com/help/help-resources/mastering-your-workflow/>, <https://www.lightbluesoftware.com/help/help-resources/using-workflows-to-send-automated-messages-to-your-clients/>, <https://www.lightbluesoftware.com/help/help-resources/using-message-templates/>, <https://www.lightbluesoftware.com/help/help-resources/setting-up-simple-confirmation-reminder-messages/>
- Enquiries & shoot management: <https://www.lightbluesoftware.com/help/help-resources/supported-api-parameters/>, <https://www.lightbluesoftware.com/help/help-resources/home-screen-widget-types/>, <https://www.lightbluesoftware.com/help/help-resources/tracking-your-post-production-in-the-home-screen/>, <https://www.lightbluesoftware.com/help/help-resources/custom-fields/>, <https://www.lightbluesoftware.com/help/help-resources/using-queries-to-find-information/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-set-up-staff-equipment-room-resources/>
- Scheduling & calendar: <https://www.lightbluesoftware.com/help/help-resources/scheduling-calendars/>, <https://www.lightbluesoftware.com/blog/2023/01/new-online-scheduling-features/>, <https://www.lightbluesoftware.com/help/help-resources/scheduling-requests/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-start-using-light-blue-as-a-diary/>, <https://www.lightbluesoftware.com/help/help-resources/zoom/>, <https://www.lightbluesoftware.com/help/help-resources/what-other-services-can-light-blue-integrate-with/>
- Payments & sales: <https://www.lightbluesoftware.com/help/help-resources/setting-up-payment-schedules-and-terms-in-light-blue/>, <https://www.lightbluesoftware.com/help/help-resources/a-detailed-look-at-payment-schedule-templates/>, <https://www.lightbluesoftware.com/help/help-resources/using-light-blue-to-manage-your-finances/>, <https://www.lightbluesoftware.com/help/help-resources/creating-a-sale/>
- Galleries & orders: <https://www.lightbluesoftware.com/help/help-resources/linking-online-galleries/>, <https://www.lightbluesoftware.com/help/help-resources/linking-pic-time/>, <https://www.lightbluesoftware.com/pic-time>, <https://www.lightbluesoftware.com/pics4schools/>, <https://www.lightbluesoftware.com/blog/2019/09/save-time-by-importing-your-proselect-orders-into-light-blue/>
- Reports & accounting: <https://www.lightbluesoftware.com/help/help-resources/light-blue-reports/>, <https://www.lightbluesoftware.com/help/help-resources/charts/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-export-your-financial-data-from-light-blue/>, <https://www.lightbluesoftware.com/help/help-resources/exporting-information-from-light-blue/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-get-data-from-light-blue-to-xero/>, <https://www.lightbluesoftware.com/help/help-resources/how-to-get-data-from-light-blue-to-quickbooks/>, <https://www.lightbluesoftware.com/help/help-resources/keeping-an-eye-on-your-profit-by-recording-your-spending-with-purchases/>, <https://www.lightbluesoftware.com/help/help-resources/making-tax-digital-mtd/>, <https://www.lightbluesoftware.com/blog/2022/11/accounting-software-for-photographers/>
- Mobile: <https://www.lightbluesoftware.com/help/help-resources/setting-up-the-light-blue-mobile-app/>, <https://www.lightbluesoftware.com/help/help-resources/publishing-invoices-for-online-payment-from-the-light-blue-mobile-app/>

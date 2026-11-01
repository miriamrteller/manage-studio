# Legal setup for a new studio

> Draft, not legal advice. / טיוטה, לא ייעוץ משפטי.

Do this for every new studio before it takes its first enrolment or booking. Studios are set up manually for now.

**Every studio, every vertical:**
1. The studio accepts the [Platform Terms](01-platform-terms.he.md) and the [DPA](02-dpa.he.md). Keep the date and the version.
2. Publish the studio's [privacy policy](03-studio-privacy-policy.he.md) (Hebrew, with English if needed) and the [accessibility statement](06-accessibility-statement.he.md).
3. Marketing is off until the studio has a consent field and an unsubscribe line ([08](08-marketing-consent.md)).

## Dance school

**Attach:** privacy policy (variant A) · [enrolment terms](07a-dance-enrolment-terms.he.md) · [health declaration](07b-health-declaration.he.md) (child and adult) · photo/media consent, separate from the terms ([09 §2](09-in-app-consent-texts.md)).

**The studio fills in:**
1. Legal name and business number, or "not yet registered"
2. Address, phone, email
3. Privacy contact (name and email)
4. Season dates and holidays
5. Prices, registration fee, payment methods and dates
6. Make-up lesson rule (days, how many)
7. Children's collection rule and emergency-contact rule
8. Accessibility contact, and accessibility of the hall

**The studio checks with its own adviser:**
- Accountant: is it registered as an עוסק, and does it issue receipts? Don't take payments without receipts.
- Police approval for every teacher who works with children.
- Insurance (third-party liability) and business licence.

## Photographer

**Attach:** privacy policy (variant B) · [photography contract](07c-photography-contract.he.md) · separate portfolio opt-in (07c §6).

**The studio fills in:**
1. Legal name, עוסק type (exempt / licensed / company) and number
2. Address, phone, email
3. Privacy contact
4. Deposit %, when the balance is due
5. Cancellation schedule (days and amounts) and rescheduling rule
6. Delivery time, gallery service, how long images are kept
7. Package contents and extras prices
8. Credit handle (for photo credits)

**The studio checks with its own adviser:**
- Accountant: whether VAT applies to prices (depends on the עוסק type), and a tax document for every deposit.
- Lawyer: the cancellation amounts are reasonable (agreed damages).
- Keep the copyright clause. Without it, the client owns private and family photos.

## Generic studio (classes, workshops, sessions)

**Attach:** privacy policy (common sections only) · enrolment terms (07a without the dance-specific parts) · a health declaration only if the activity is physical.

**The studio fills in:** items 1–5 of the dance list, plus its cancellation and refund rules.

**The studio checks with its own adviser:** registration and receipts (accountant), insurance, and any licence its activity needs.

---

## For the automatic onboarding

What the onboarding wizard must collect. Store each answer with the tenant, plus who gave it and when.

**Legal acceptance (required, unticked by default)**
- [ ] Checkbox "I agree to the Terms of Service and the DPA, and have read the Privacy Policy" → store `terms_version`, `dpa_version`, `accepted_at`, `accepted_by_user_id`, `ip`.

**Business identity**
- `legal_name` (text, required)
- `business_status`: `not_registered` | `osek_patur` | `osek_murshe` | `company` (required)
- `business_number` (text; required unless `not_registered`)
- `address`, `phone`, `contact_email` (required)
- `privacy_contact_name`, `privacy_contact_email` (required)
- `accessibility_contact_name`, `accessibility_contact_phone`/`email` (required)
- `vat_included` (boolean; forced to "no VAT" when `osek_patur`)

**Vertical-specific**
- Dance / generic: `season_start`, `season_end`, `holidays` (prefill from the calendar), `registration_fee`, `payment_methods[]`, `makeup_days`, `makeup_max`, `collection_age`, `health_declaration_required` (boolean).
- Photographer: `deposit_percent`, `balance_due` (`before_shoot` | `before_delivery` | `instalments`), `cancellation_schedule[]` (`days_before`, `refund_rule`), `reschedule_free_days`, `delivery_days`, `gallery_service`, `gallery_retention_months`, `credit_handle`.

**Generated from the answers**
- Fill the `[[…]]` placeholders in the Hebrew and English templates for 03, 06, 07a/07c and 07b. Show a preview, and let the studio edit before publishing.
- Create the `consent_templates` rows: health declaration (dance) or contract (photographer), and the photo/portfolio consent.
- Set the studio's privacy, terms and accessibility URLs for the footer.

**Blocking rules**
- No live payments while `business_status = not_registered`. Show: "Register as a business and connect an invoicing provider first."
- Marketing sends stay disabled until the studio has published its privacy policy.

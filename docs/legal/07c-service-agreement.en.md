> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> Hebrew version: [07c-service-agreement.he.md](07c-service-agreement.he.md).
> Base agreement for any service provider that books jobs or sessions (photographer, beautician, tutor, coach, and so on). The app attaches the add-on for the studio's type: [photographer](07c-addon-photographer.en.md) · [beautician](07c-addon-beautician.en.md) · [coaching / tutoring](07c-addon-coaching.en.md); a general studio uses the base alone. `{{client_name}}`, `{{shoot_date}}`, `{{location}}`, `{{package}}`, `{{price}}` are filled by the app (`supabase/functions/_shared/job-contract.ts`); fill the [[PLACEHOLDERS]] once, in the template.

# Service Agreement

**Provider:** [[PROVIDER LEGAL NAME]], [[עוסק פטור / עוסק מורשה / company]] no. [[NUMBER]], [[ADDRESS]], [[PHONE]], [[EMAIL]] ("**Provider**").
**Client:** {{client_name}} ("**Client**").

## 1. The service

- Service: {{package}} — includes [[WHAT IS INCLUDED: duration, number of sessions or items, what is delivered and how]].
- Date and time: {{shoot_date}} · Place: {{location}} [[or "online", if applicable]].
- Extras (beyond the package): [[PRICES — for example an extra hour, travel beyond [[KM]] km, extra items]].
- **Service-specific terms:** the add-on for [[SERVICE TYPE — photography / beauty treatment / coaching or tutoring]] attached to this agreement forms part of it. If the add-on and this agreement differ, the add-on applies to its subject.

## 2. Price and payment

- Total price: {{price}} [[incl. VAT / no VAT — עוסק פטור]].
- **Deposit:** [[%]] of the price, paid when signing, to reserve the date.
- **Balance:** paid [[before the service / on delivery / in N instalments]] through the payment link the Provider sends, or [[cash / bank transfer / Bit]].
- The Provider issues a tax document (receipt / tax invoice) for each payment.
- Late payment: a written reminder first; the Provider may hold delivery of outstanding items until payment.

## 3. Cancellation and rescheduling

**a. Cancellation within 14 days of signing (if the agreement was made online or by phone):**
The Client may cancel within 14 days of signing (or of receiving this agreement, if later) and gets a refund less a cancellation fee of **5% of the price or ₪100, whichever is lower**. If the service has already started, the Client also pays for what was already given. [[LAWYER: check whether the §14C(d) exception for services due to start within 7 days applies to this service, and state the result here.]]

**b. Cancellation by the Client after that:**
- More than [[N]] days before the date: [[deposit refunded less ₪X / deposit kept]].
- [[N–M]] days before: [[the deposit is kept]].
- Less than [[M]] days before: [[deposit kept and X% of the balance is due]].
These amounts are agreed compensation that reflects the Provider's reasonable loss from a reserved date. ([[LAWYER: agreed compensation must bear a reasonable relation to the expected damage — Contracts (Remedies) Law §15. Check the amounts.]])

**c. Rescheduling:** one change of date is free if requested at least [[N]] days before and a new date is available within [[6 months]]. Otherwise it is treated as cancellation.

**d. Cancellation by the Provider:** if the Provider cannot provide the service for a reason within their control, the Client gets a full refund. If it is due to illness or emergency, the Provider will offer a new date or, with the Client's agreement, a professional substitute of similar level; otherwise a full refund.

**e. Events beyond control:** neither party is responsible for a delay or failure caused by events beyond its control (for example war, a security situation, Home Front Command restrictions, natural disaster, epidemic). The parties will agree a new date; if that is not possible within [[6 months]], amounts paid are refunded less reasonable costs already incurred ([[LAWYER: confirm]]).

## 4. Client's responsibilities

The Client gives the Provider the information needed to provide the service, arrives on time, arranges any permits or access the place requires, and tells the Provider in advance about anything that may affect the service. Delays caused by the Client may shorten the service time.

## 5. Minors

If the service is for a person under 18, the Client confirms they are that person's parent or legal guardian, or have the guardian's consent, and that the guardian's contact details are on file.

## 6. Liability

- The Provider provides the service with professional care and skill.
- If the service cannot be completed, or work product is lost or damaged, for a reason beyond the Provider's reasonable control, the Provider's liability is limited to **refunding the amounts paid** for the affected part of the service [[or providing it again, where possible]].
- This limit does not apply to bodily injury, to damage caused intentionally or by gross negligence, or where the law does not allow a limit.

## 7. Privacy

Personal information is handled under the Provider's [Privacy Policy](03-studio-privacy-policy.en.md). Photos, recordings or results of the service are used for the Provider's portfolio or marketing **only with the Client's separate consent**, which can be withdrawn at any time for future use.

## 8. General

Israeli law applies. If these terms and the law differ, the law that protects the consumer prevails. Competent courts in [[CITY]]. This agreement is signed electronically; both sides receive a PDF copy.

**Language.** This document is published in English and Hebrew. If the two versions differ, the English version prevails.

---

**Signature:** typed full name + checkbox "I have read and agree to this agreement" (see [09-in-app-consent-texts](09-in-app-consent-texts.md), contract e-signature).

---

### Awaiting lawyer review (see [AWAITING-LAWYER-REVIEW](AWAITING-LAWYER-REVIEW.md))
- [[LAWYER: confirm]] A studio that is not yet a registered business is identified as "<studio>, run by <full name>" with the person's Israeli ID number (ת.ז.), or, for someone without one, a passport number and the issuing country. This number appears in the published document. Confirm the wording, that publishing an ID number is required or justified here, and the foreign-resident (passport) case.

### Drafting notes

- The app fills `{{shoot_date}}` for any job date; the token name is historical. The add-on files reuse the same tokens.
- Keep the agreed-compensation schedule modest; courts reduce amounts that do not reflect the likely loss (Contracts (Remedies) Law §15).
- For physical activities the Provider also collects a [health declaration](07b-health-declaration-adult.en.md) ([child version](07b-health-declaration-child.en.md)); it is a separate form, never part of this agreement.

### Sources relied on
- Consumer Protection Law 5741-1981: §14C (distance sale: 14 days, disclosure, fee cap); §14C(d) (exceptions — *verify per service*).
- Consumer Protection (Cancellation of Transaction) Regulations 5771-2010 (fee: 5% or ₪100, the lower).
- Contracts (Remedies for Breach of Contract) Law 5731-1970, §15 (agreed compensation).
- Standard Contracts Law 5743-1982, §4.
- Legal Capacity and Guardianship Law 5722-1962, §14 (parents as natural guardians).
- Electronic Signature Law 5761-2001 (see doc 09 for the level of the typed-name signature).

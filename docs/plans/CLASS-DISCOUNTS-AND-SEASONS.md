# Class discounts and seasons: plan

Status: plan only, nothing built. Owner decisions from 10 Nov 2026 are marked "Decided".

## Today (main, 10 Nov 2026)

- No discount rules exist. A studio can only set a student's own monthly amount, or a one-off amount for one month, by hand (`supabase/migrations/20261102203611_billing_custom_amounts.sql`, `supabase/functions/_shared/payments/month-amount.ts`).
- Monthly billing charges every month until the plan is cancelled. It does not stop at the season's end date and knows nothing about holidays (`supabase/functions/run-monthly-billing/index.ts`, `supabase/functions/_shared/payments/renewal-billing.ts`).
- The timetable already skips Israeli holidays (`supabase/functions/_shared/holidays.ts`).

## Discounts

- **Decided:** first version has four automatic discounts: sibling (2nd child, and a separate amount for the 3rd child and more), extra class for the same child, early bird (before a date set per season) and paying the whole season up front. Promo codes later.
- **Decided:** discounts add up in a fixed order, with a maximum total the studio sets. A studio can switch to "only the biggest discount".
- **Decided:** if a sibling leaves mid-season, the other child keeps the sibling discount until the season ends.
- Settings > Discounts (הגדרות > הנחות), only for studios that teach classes. Each rule has an on/off switch and an amount (percentage or shekels), prefilled and editable. All rules start switched off.
- **Built (first version):**
  - The database works the discount out once, when the enrolment is made, and stores it on the enrolment (`engagements.discount_minor`, `discount_lines`; migration `20261110111500_class_discounts.sql`). A later rule change, or a sibling leaving, never changes a price already given.
  - Sibling: the 2nd child of a family (same family account) to enrol in a class that season gets the sibling amount; the 3rd child and more get the second amount. The order is each child's first class enrolment in the season, so the first child's extra class does not count as a sibling one.
  - Extra class: the same child's 2nd class or more in the same season.
  - Early bird: enrolled at least a set number of days before the season starts (prefilled: 30 days), so the date follows each season by itself.
  - Classes only. For a monthly class the discount comes off every month. A personal monthly amount set by hand replaces the discounted price.
  - Parents see the class price and each discount as its own line before paying. Admins see the same lines on the student's enrolment.
- **Later:** promo codes; the whole-season-up-front discount needs a "pay monthly or the whole season" choice at checkout, which does not exist yet.

### Tax and legal questions (lawyer list row 31)

[[ACCOUNTANT: confirm]] [[LAWYER: confirm]]

1. Accountant: the payment provider is sent the price after discount, so the receipt or invoice shows that price only, not a separate discount line. Is that right, and is VAT on the price after discount?
2. Lawyer: the parent sees the class price, each discount and the total before paying. Is that enough for price display rules?

## Holidays and seasons

- **Decided:** Sukkot, Pesach and the summer fall between seasons, so a year has more than one season (for example after Sukkot to Pesach, and after Pesach to the summer). Minor holidays (for example Chanukah and Purim) fall inside a season.
- **Decided:** the season price is split into equal monthly payments over the season's months. Minor holidays inside the season are included, so every month costs the same, and a studio can mark a month as "no charge" for a real closure. Billing stops at the end of the season, so nothing is charged over the breaks.
- **Decided wording** at enrolment (payment step, and the enrolment terms "Price and payment"):
  - EN: "To keep things simple, you pay the same amount every month of the season. Short holiday breaks, like Chanukah and Purim, are already built into the price, so there are no surprises."
  - HE: "כדי שיהיה פשוט, משלמים אותו סכום בכל חודש של העונה. חופשות קצרות, כמו חנוכה ופורים, כבר כלולות במחיר, כך שאין הפתעות."
  - Goes on the lawyer list when it is added to the terms.
- **Decided (build after the lawyer answers):** automatic re-enrolment between seasons. A set time before each season ends (before Sukkot, Pesach and the summer), each active student is placed in the same class for the next season. The parent gets an email (EN and HE) with the new dates and price, a one-tap "Don't re-enrol" link and a deadline. After the deadline the place is confirmed and billing continues with the saved card. A studio can switch this off and ask parents to confirm instead.

### Legal questions (lawyer list row 30)

[[LAWYER: confirm]]

1. Can a new season be added automatically with an opt-out, or must the parent actively confirm?
2. What consent is needed at first sign-up for automatic re-enrolment, and what must the enrolment terms say?
3. How much notice must the parent get before the new season, through which channel, and must the notice say how to opt out?
4. May the saved card be charged for the new season on the strength of the original consent?

No enrolment terms wording is written yet. When it is, it goes on the lawyer list too.

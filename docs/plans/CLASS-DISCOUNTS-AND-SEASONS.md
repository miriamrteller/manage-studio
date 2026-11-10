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
- Settings > Discounts (הגדרות > הנחות). Each rule has an on/off switch and an amount (percentage or shekels), prefilled and editable. The parent sees each discount as its own line before paying.

## Holidays and seasons

- **Decided:** Sukkot, Pesach and the summer fall between seasons, so a year has more than one season (for example after Sukkot to Pesach, and after Pesach to the summer). Minor holidays (for example Chanukah and Purim) fall inside a season.
- **Decided:** the season price is split into equal monthly payments over the season's months. Minor holidays inside the season are included, so every month costs the same, and a studio can mark a month as "no charge" for a real closure. Billing stops at the end of the season, so nothing is charged over the breaks.
- Proposed wording at enrolment (payment step and enrolment terms "Price and payment"), not yet agreed: "The season fee is split into equal monthly payments. Holidays during the season when the studio is closed, such as Chanukah and Purim, are already included, so every month costs the same." Goes on the lawyer list when it is added to the terms.
- **Decided (build after the lawyer answers):** automatic re-enrolment between seasons. A set time before each season ends (before Sukkot, Pesach and the summer), each active student is placed in the same class for the next season. The parent gets an email (EN and HE) with the new dates and price, a one-tap "Don't re-enrol" link and a deadline. After the deadline the place is confirmed and billing continues with the saved card. A studio can switch this off and ask parents to confirm instead.

### Legal questions (lawyer list row 30)

[[LAWYER: confirm]]

1. Can a new season be added automatically with an opt-out, or must the parent actively confirm?
2. What consent is needed at first sign-up for automatic re-enrolment, and what must the enrolment terms say?
3. How much notice must the parent get before the new season, through which channel, and must the notice say how to opt out?
4. May the saved card be charged for the new season on the strength of the original consent?

No enrolment terms wording is written yet. When it is, it goes on the lawyer list too.

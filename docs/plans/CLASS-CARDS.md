# Class cards (plan)

**Status: plan only, nothing built.** Owner answered the questions on 10 Nov 2026. Building waits for the go-ahead.

A class card ("כרטיסייה") lets a client pay once for a bundle of classes, for example 10, and use one class each time they come. It is an option alongside the season plan with monthly payments. It is mainly for adult classes, but any class the studio ticks can take a card.

Names: "Class card" / "כרטיסייה". Never "credit" (that word belongs to [ACCOUNT-CREDIT.md](ACCOUNT-CREDIT.md)).

## What exists today (main, 10 Nov 2026)

- Adults can already enrol themselves (`NewAdultForm`), and classes are paid monthly or once (`offerings.billing_mode`).
- No single class session can be booked. Slot booking is only for one-to-one services (`offering_type = 'appointment'`).
- `attendance` (session, person, attended) exists, but no screen takes the register.
- `service_credits` (make-up sessions, `sessions_remaining`, `expires_at`) exists and is unused. Class cards get their own tables, so make-ups stay separate.
- No clash with the discounts and seasons plan. A card is not a season enrolment and gets no season discounts.

## Owner decisions (10 Nov 2026)

| Question | Answer |
|---|---|
| On or off | The studio admin switches class cards on or off in Settings. **Off by default.** While off, no card appears anywhere, for the studio or its clients. |
| Sizes and prices | Each studio sets its own. Suggested to start: 5 and 10 classes, editable. |
| Expiry | Studio sets a "valid for" period. 3 months to start with, can be changed or switched off. |
| Carry-over | Extend once on request: the client asks, the admin approves with one button, and the card gets 3 more months to start with (the studio can change the length). This matches the coaching sessions agreement (lawyer row 13). |
| Which classes | Studio ticks the classes each card covers. Adult classes are ticked to start with. |
| How clients come | Both: book a place in the portal, or walk in and the teacher ticks them on the register. One class comes off either way. |
| Late cancel and no-show | Studio sets a cutoff, 12 hours to start with. Cancel earlier and the class goes back on the card. Later, or not coming, uses it. The admin can always give a class back. |
| Sharing | Studio chooses per card: personal (the default) or shared within one family account. |
| Where to buy | The studio's public class page (for new clients) and the client portal. |
| Forms to sign | The studio's usual forms (terms, and a health declaration if the studio uses one) are signed once, at the first card, prefilled from what we know. Later cards reuse the signed copy. |
| Pay at the studio | Allowed. The admin sells the card on the client's page and records it as paid at the studio, and the card starts straight away. |
| Full class | The class shows as full and the client picks another. No waiting list for now. |
| Refunds | No refunds on cards. Shown to the client before they pay. **Waits for the lawyer** (lawyer list row 34): the class enrolment terms (07a §4) already give a 14-day cancellation right and let a client end an ongoing service at any time. |

## How it works

**Studio (admin)**
- Settings → Class cards: an on/off switch at the top (off to start with). Once it's on: name, number of classes, price, valid for (months), classes covered, personal or shared, late-cancel cutoff. Everything is prefilled and can be edited.
- Client page: their cards, classes left, expiry, history (each class used, given back or extended).
- Class register: a new screen per session. It lists who booked and lets the teacher tick walk-ins. Ticking a card holder uses one class.

**Client (portal)**
- Buy a card through the normal one-off checkout (YPay now, Takbull when live). The no-refund line and the expiry are shown before paying.
- "Your cards: 7 of 10 left, valid until 10 Feb", with "Ask for more time" (once per card).
- Book a place in a covered class. Cancel up to the cutoff for the class back.

**Storage (built in PR 1, migration `20261110160100_class_cards.sql`)**
- `tenant_class_card_settings`: the on/off switch (no row = off), cutoff hours (12), extension months (3).
- `class_card_types` (the studio's cards) and `class_card_type_offerings` (the classes each covers).
- `class_cards`: a card someone holds. Name, classes and price are copied from the type. `account_id` is set when the card is shared. `valid_until` NULL means it never expires.
- `class_card_visits`: each class taken. Classes left = classes bought minus visits that are booked, attended, late-cancelled or no-show. A cancel in time (`cancelled`) or a class the admin gives back (`returned`) frees it. Expiry is a date check, so no nightly job is needed.
- Writes go only through row-locked, audited functions: `issue_class_card`, `book_class_with_card`, `check_in_with_class_card`, `cancel_class_card_booking`, `set_class_card_visit_status`, `request_class_card_extension`, `extend_class_card`. Reads: `get_my_class_cards`, `get_person_class_cards`.
- Online booking respects the class size (active enrolments plus booked card holders). A walk-in the teacher ticks in does not.

**Buying online (built in migration `20261110160400_class_card_purchase.sql`)**
- The portal lists the cards on sale with the number of classes and the expiry ("valid for 3 months from when you pay"). "Buy" calls `start_class_card_purchase`: the card is held as `awaiting_payment` and a payment request (`job_payment_requests.class_card_id`) opens the usual `/pay/:token` page. Starting again reuses the open purchase, and a free card starts at once.
- When the request is paid (online, or recorded by the admin), a trigger starts the card today with the type's expiry and links the payment. If it is cancelled or refunded, the card is cancelled.
- For now the request hangs off the client's (or family's) active class enrolment, because payment requests and every payment callback need an engagement. A client with no enrolment is told to buy at the studio. Buying without an enrolment, and on the public class page, waits on the owner's choice about teaching the payment code about cards.

## PR split

1. (M) Tables, rules and functions, tests (`supabase/tests/class-cards`), `definer-execute.json`.
2. (M) Settings → Class cards with the on/off switch (default off), and selling a card through the existing one-off checkout.
3. (M) Class register screen (walk-ins), which uses a class.
4. (M) Portal booking and cancelling with the cutoff, and the client's card balance.
5. (S) Screens for the client's extension request and the admin's give-back and one-time extend (the rules are in PR 1), docs and lawyer wording.

## Legal

All client-facing wording is on the lawyer list, row 34: expiry, late cancellation, no refunds and the one-time extension. [[LAWYER: confirm]]

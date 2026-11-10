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
| Sizes and prices | Each studio sets its own. Suggested to start: 5 and 10 classes, editable. |
| Expiry | Studio sets a "valid for" period. 3 months to start with, can be changed or switched off. |
| Carry-over | Extend once on request: the client asks, the admin approves with one button, and the card gets 3 more months to start with (the studio can change the length). This matches the coaching sessions agreement (lawyer row 13). |
| Which classes | Studio ticks the classes each card covers. Adult classes are ticked to start with. |
| How clients come | Both: book a place in the portal, or walk in and the teacher ticks them on the register. One class comes off either way. |
| Late cancel and no-show | Studio sets a cutoff, 12 hours to start with. Cancel earlier and the class goes back on the card. Later, or not coming, uses it. The admin can always give a class back. |
| Sharing | Studio chooses per card: personal (the default) or shared within one family account. |
| Refunds | No refunds on cards. Shown to the client before they pay. **Waits for the lawyer** (lawyer list row 34): the class enrolment terms (07a §4) already give a 14-day cancellation right and let a client end an ongoing service at any time. |

## How it works

**Studio (admin)**
- Settings → Class cards: name, number of classes, price, valid for (months), classes covered, personal or shared, late-cancel cutoff. Everything is prefilled and can be edited.
- Client page: their cards, classes left, expiry, history (each class used, given back or extended).
- Class register: a new screen per session. It lists who booked and lets the teacher tick walk-ins. Ticking a card holder uses one class.

**Client (portal)**
- Buy a card through the normal one-off checkout (YPay now, Takbull when live). The no-refund line and the expiry are shown before paying.
- "Your cards: 7 of 10 left, valid until 10 Feb", with "Ask for more time" (once per card).
- Book a place in a covered class. Cancel up to the cutoff for the class back.

**Storage (sketch)**
- `class_card_types` (the studio's cards) and `class_cards` (a bought card: owner person or family account, classes bought, expiry, source payment).
- `class_card_entries`: an insert-only ledger (`used`, `returned`, `extended`, `expired`). Classes left = classes bought minus the sum. One row-locked RPC, so it never goes below zero.
- Bookings reuse `attendance` rows with a booked or attended state. Capacity is checked against `offerings.max_capacity`.

## PR split

1. (M) Tables, ledger, RPCs, security tests, `definer-execute.json`.
2. (M) Settings → Class cards, and selling a card through the existing one-off checkout.
3. (M) Class register screen (walk-ins), which uses a class.
4. (M) Portal booking and cancelling with the cutoff, and the client's card balance.
5. (S) Expiry job, client extension request, admin give-back and one-time extend, docs and lawyer wording.

## Legal

All client-facing wording is on the lawyer list, row 34: expiry, late cancellation, no refunds and the one-time extension. [[LAWYER: confirm]]

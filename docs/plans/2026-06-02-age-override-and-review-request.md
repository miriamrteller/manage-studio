# Age override + parent review — index

| Field | Value |
| --- | --- |
| **Status** | PR A ✅ complete · PR B 🟡 ~95% (merge pending bug fixes + E2E smoke) |
| **Live tracker** | [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) |
| **SPEC** | §4.2.5 age bands · §6 Phase 1C enrolment |

## Agent plans (use these)

| PR | Plan | When |
| --- | --- | --- |
| **A** — Admin override hardening | [archive/age-override-pr-a.md](archive/age-override-pr-a.md) | ✅ Complete (archived) |
| **B** — Parent review + admin approve/decline | [age-override-pr-b.md](age-override-pr-b.md) | Active — finish smoke, merge |

## Problem (summary)

- **Parents/guests** blocked when age at season start is outside offering min/max.
- **Admins** override with audit trail → `pending_payment`.
- **Parents** request studio review → `admin_review` → admin approve/decline + email.

Do not conflate admin override with parent review.

## Out of scope

Payments/checkout pricing changes beyond blocking `admin_review`; WhatsApp for review requests.

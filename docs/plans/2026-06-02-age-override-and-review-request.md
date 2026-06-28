# Age override + parent review — index

| Field | Value |
| --- | --- |
| **Status** | ✅ **Complete** (code on `feat/UI-fixes` / `baa6dd1`) — manual E2E smoke recommended before prod |
| **Live tracker** | [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) |
| **SPEC** | §4.2.5 age bands · §6 Phase 1C enrolment |

## Agent plans

| PR | Plan | Status |
| --- | --- | --- |
| **A** — Admin override hardening | [archive/age-override-pr-a.md](archive/age-override-pr-a.md) | ✅ Archived |
| **B** — Parent review + admin approve/decline | [age-override-pr-b.md](age-override-pr-b.md) | ✅ Shipped |

## Problem (summary)

- **Parents/guests** blocked when age at season start is outside offering min/max.
- **Admins** override with audit trail → `pending_payment`.
- **Parents** request studio review → `admin_review` → admin approve/decline + email.

Do not conflate admin override with parent review.

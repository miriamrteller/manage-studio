# Code rename epic (formerly Phase D5)

**Status:** Deferred  
**Not part of Phase D** (display wiring — complete).

## Scope

Rename feature folders, routes, and components from dance-specific names to generic domain names:

- `features/classes` → `features/offerings`
- `/admin/setup/classes` → `/admin/setup/offerings`
- `ClassForm` → `OfferingForm`, etc.

## When

Optional hygiene when building a second non-dance tenant, or when code clarity outweighs churn cost.

## Out of scope

- i18n display strings (handled by `useEntityLabels`)
- Database table names (already generic)

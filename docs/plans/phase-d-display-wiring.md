# Phase D — Tenant label display wiring (complete)

**Status:** Complete (2026-06-07)

Phase D wires `tenants.business_preset` and `tenants.labels` into the React UI so entity nouns (Class, Family, Term, etc.) are driven by the preset rather than hardcoded strings.

This phase is **read-only display wiring**. Tenant provisioning UI belongs under [V3.0 operator onboarding](v3-0-operator-onboarding-wizard.md) and [tenant settings hub](tenant-settings-hub.md).

## Sub-phases

| ID | Name | Status |
|----|------|--------|
| D1 | Label infra (`parseEntityLabelOverrides`, `TenantConfig`, `useTenant`) | Done |
| D1b | Labels context (`LabelsProvider`, `useEntityLabels`) | Done |
| D2 | Nav + module gating | Done |
| D3a | Entity-noun headings | Done |
| D3b | Entity-noun sentence templates | Done |
| D6 | TODO cleanup | Done |
| ~~D4~~ | ~~Admin label editor~~ | **Removed** — misnamed; see V3.0 onboarding wizard |
| D5 | Code rename epic (folder/route renames) | **Renamed** — separate epic, not part of Phase D |

## Verification

- `programs` preset + `{}` labels → Creative Ballet wording unchanged in EN/HE
- `useEntityLabels()` consumed via context (set once on tenant load)
- `tsc --noEmit` and unit tests pass

## Next work (not Phase D)

- [Tenant settings hub](tenant-settings-hub.md) — day-2 admin edits
- [V3.0 operator onboarding wizard](v3-0-operator-onboarding-wizard.md) — second industry tenant
- Code rename epic (old D5) — optional hygiene

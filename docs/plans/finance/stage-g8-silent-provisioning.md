# Stage G8 — Silent Grow signup (parallel track)

**Goal:** New IL tenants get working **Grow (Meshulam)** credentials **without** manually pasting userId + pageCode + API key in settings — optional for **V1 complete** alongside [I6](icount/stage-i6-silent-provisioning.md). **Does not block** Grow integration (G0–G7 ✅) or iCount track (I2a+).

**Read with:** [00-overview.md](00-overview.md) · [GROW-RUNBOOK.md](GROW-RUNBOOK.md) · [GROW-API-REFERENCE.md](GROW-API-REFERENCE.md) · [v3-0-operator-onboarding-wizard.md](../v3-0-operator-onboarding-wizard.md) · [icount/stage-i6-silent-provisioning.md](icount/stage-i6-silent-provisioning.md) (symmetric pattern)

---

## Product intent

| Path | When | User action |
|------|------|-------------|
| **Silent (G8)** | Target if partner API exists | Operator provisions tenant → Grow merchant + page + API key stored automatically |
| **Manual (G7)** | Fallback always available | Tenant admin picks **Grow** on bundled settings → `GrowSettingsForm` + `save_tenant_grow_credentials` |

Integration and iCount stages **must not wait** on G8. Manual Grow setup is the supported path until G8-impl DoD passes (same as I6 for iCount).

---

## Dual-track rule

```text
Grow integration (done):  G0 ✅ → … → G7 ✅
Grow provisioning:        G8-research ──→ G8-impl (optional V1 gate)

iCount provisioning:      I6-research ──→ I6-impl (required for V1 complete per icount/00-overview)
```

**G8 is optional** unless product signs Grow silent signup as a V1 requirement. **I6 may still be required** for icount-default IL tenants.

---

## G8-research — Partner / marketplace onboarding (no Grow partner account required to *start*)

**Prerequisite:** G7 complete; draft understanding of Light API ([GROW-API-REFERENCE.md](GROW-API-REFERENCE.md)).

### Scope IN

1. Identify **official** Grow/Meshulam **partner, marketplace, or reseller** onboarding API — start with [grow.business/api-developers](https://grow.business/api-developers/) (multi-business / marketplace claims) and [grow-il.readme.io](https://grow-il.readme.io/docs/light-api); add **sales/partner** docs (not invented endpoints).
2. Determine whether Light API includes **merchant creation** or only **payment ops** on existing `userId` / `pageCode` / `apiKey`.
3. Map OpalSwift data from `provision_tenant` + operator wizard → Grow signup payload (business name, contact, VAT id, subdomain, etc.).
4. Document **success path**: API response → `userId`, `pageCode`, `apiKey` → `save_tenant_grow_credentials` (or server-side equivalent).
5. Document **failure path**: fallback to bundled settings (Grow tab) + admin banner copy.
6. Document **manual-only steps** likely to remain (SHAAM / Israel Invoice in Grow dashboard per [GROW-RUNBOOK §2](GROW-RUNBOOK.md)).
7. Security: platform partner credentials in Supabase secrets; never in repo.
8. Output: **`G8-ADR.md`** with signup-only catalog rows + explicit **go / no-go / defer** for G8-impl.

### Scope OUT

- Implementation edge functions
- Blocking I2a / I0-live / I6 agents
- Replacing manual Grow settings form

### DoD (G8-research)

- [ ] Partner or marketplace API URL + auth model cited — **or** explicit “no public onboarding API — G8-impl blocked pending Grow partner agreement”
- [ ] Field mapping table OpalSwift → Grow
- [ ] Success / failure / manual-SHAAM flows documented
- [ ] Comparison note: Light API methods already used in code vs onboarding gap
- [ ] User sign-off on research before G8-impl

---

## G8-impl — Silent Grow provisioning (partner credentials)

**Prerequisite:** G8-research signed; `save_tenant_grow_credentials` exists; operator wizard scaffold ([v3-0-operator-onboarding-wizard.md](../v3-0-operator-onboarding-wizard.md)).

**May run in parallel** with I0-live / I2b / I6-impl once research is done.

### Scope IN

1. Platform secret(s) for Grow partner API (Supabase secrets — [GROW-RUNBOOK](GROW-RUNBOOK.md)).
2. Edge function or job: **`provision-grow-tenant`** (name TBD) after `provision_tenant` when `country=IL` **and** tenant selected Grow (or pre-I5 default grow).
3. On success: atomic `grow/grow` + encrypted credentials + optional webhook URL registration if API supports it.
4. On failure: `grow_setup_status` or audit flag → `manual_required`; UI banner on bundled payments page.
5. TDD: provisioning never calls iCount adapters; failed silent signup does not block enrolment once manual creds saved.
6. Grow regression + icount isolation tests stay green.

### Scope OUT

- Removing manual Grow form (keep as fallback)
- Invented partner endpoints

### DoD (G8-impl)

- [ ] New IL tenant (Grow path) → credentials stored without admin paste (happy path)
- [ ] Simulated partner failure → manual fallback banner + Grow form works
- [ ] No grow/icount cross-wiring in provisioning job
- [ ] GROW-RUNBOOK updated (platform secrets, ops retry)
- [ ] `pnpm -C apps/web test` green

---

## Agent dispatch

| Stage | Ready without Grow partner API docs? |
|-------|--------------------------------------|
| **G8-research** | ✅ Yes — research only |
| **G8-impl** | ❌ No — needs G8-research sign-off + partner credentials |

**Stop:** One sub-stage per session (research **or** impl).

### Paste prompt (G8-research)

```text
Stage G8-research only — docs, no code.

Read @docs/plans/finance/stage-g8-silent-provisioning.md (G8-research section),
@docs/plans/finance/GROW-API-REFERENCE.md, and @docs/plans/finance/GROW-RUNBOOK.md.

Deliver docs/plans/finance/G8-ADR.md per G8-research DoD:
partner/marketplace onboarding API auth model, OpalSwift→Grow field mapping,
success/failure paths (manual bundled Grow settings fallback), SHAAM manual steps,
go/no-go for G8-impl.

Stop after research — no G8-impl. Do not block I2a/I6 work.
```

Generate via: `pnpm finance:prompt g8-research`

---

## V1 gate (product decision)

| Track | V1 requirement (current plan) |
|-------|-------------------------------|
| **I6** | Required for V1 complete ([icount/00-overview.md](icount/00-overview.md)) |
| **G8** | Optional unless product adds to V1 gate — manual Grow remains valid |

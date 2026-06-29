# Stage I6 — Silent iCount signup (parallel track)

**Goal:** New IL tenants get a working iCount account **without** manually pasting cid + API token in settings — before **V1 complete**. **Does not block** the integration track (I3 → I2a → I0-live → I2b → I5).

**Read with:** [00-overview.md](00-overview.md) (dual tracks) · [SPIKE-ADR.md](SPIKE-ADR.md) · [API-V3-REFERENCE.md](API-V3-REFERENCE.md) (registration module) · [v3-0-operator-onboarding-wizard.md](../../v3-0-operator-onboarding-wizard.md)

---

## Product intent

| Path | When | User action |
|------|------|-------------|
| **Silent (I6)** | Target for V1 | Operator provisions tenant → iCount account created automatically |
| **Manual (I3)** | Fallback always available | Tenant admin uses `IcountSettingsForm` + `save_tenant_icount_credentials` |

Integration stages **must not wait** on I6. Manual settings is the supported path until I6 DoD passes.

---

## Dual-track rule

```text
Integration track:  I1 ✅ → I3 → I2a → I0-live → I2b → I4* → I5
Provisioning track:   I6-research (now) ──→ I6-impl (before V1 complete)
```

**I5** may ship with manual setup only. **V1 complete** requires **I6** (or signed deferral with date — user policy: **no open-ended deferral**).

---

## I6-research — Partner / OTP flow (no account required to start)

**Prerequisite:** I0-doc SPIKE-ADR draft accepted.

### Scope IN

1. Identify **official** iCount partner / reseller / OTP signup API — start with apiv3 [`registration`](https://apiv3.icount.co.il/#/module/registration/register) module (`register`, `wizard`, `otp_*`, `cid_valid`) plus any partner-only docs (sales portal — **not** help-center invention).
2. Map OpalSwift data from `provision_tenant` + operator wizard to iCount signup payload (business name, VAT id, contact, subdomain, etc.).
3. Document **success path**: API response → `cid`, `cp`, API token → `save_tenant_icount_credentials` (or platform-level write).
4. Document **failure path**: fallback to manual I3 settings + admin banner copy.
5. Security: where platform master credentials live (Supabase secrets); never in repo.
6. Output: **`I6-ADR.md`** (or SPIKE-ADR appendix) with API catalog rows for signup only.

### Scope OUT

- Implementation edge functions
- Blocking I3/I2a agents

### DoD (I6-research)

- [ ] Partner API URL + auth model cited (or **explicit “no public API — V1 blocked on partner agreement”**)
- [ ] Field mapping table OpalSwift → iCount
- [ ] Failure / fallback flow documented
- [ ] User sign-off on research before I6-impl

---

## I6-impl — Silent provisioning (account + partner credentials)

**Prerequisite:** I6-research signed; I1 credential RPCs exist; operator wizard scaffold ([v3-0-operator-onboarding-wizard.md](../../v3-0-operator-onboarding-wizard.md)).

**May run in parallel** with I0-live / I2b once research is done.

### Scope IN

1. Platform secret(s) for iCount partner API (Supabase secrets — RUNBOOK).
2. Edge function or async job: **`provision-icount-tenant`** (name TBD) invoked post-`provision_tenant` when `country=IL` **or** from wizard step 6 “Integrations”.
3. On success: atomic `icount/icount` + encrypted credentials (reuse `save_tenant_icount_credentials` logic server-side).
4. On failure: tenant slug `icount/icount` (if I5 already flipped) or pending state; **`icount_setup_status`** column or audit flag → `manual_required`; UI banner.
5. CC page + webhook URL configuration via API **if** partner docs support it; else document manual ops step in RUNBOOK.
6. TDD: provisioning never calls Grow adapters; failed silent signup does not break enrolment once manual credentials saved.

### Scope OUT

- Replacing manual settings form (keep as fallback)
- Invented partner endpoints (#29)

### Error handling

Follow [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) § Provisioning.

### DoD (I6-impl)

- [ ] New IL tenant via wizard → iCount credentials stored without admin paste (happy path)
- [ ] Simulated partner failure → manual fallback banner + settings form works
- [ ] No Grow/icount cross-wiring in provisioning job
- [ ] RUNBOOK updated (platform secrets, ops retry)
- [ ] `pnpm -C apps/web test` green

---

## V1 complete gate (includes I6)

See [00-overview.md](00-overview.md#v1-complete-gate). I6-impl DoD required unless user signs dated deferral.

---

## Agent dispatch

| Stage | Ready without partner API docs? |
|-------|-------------------------------|
| **I6-research** | ✅ Yes — research only |
| **I6-impl** | ❌ No — needs I6-research sign-off + partner credentials |

**Stop:** One sub-stage per session (research **or** impl).

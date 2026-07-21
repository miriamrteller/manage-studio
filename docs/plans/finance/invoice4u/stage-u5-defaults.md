# Stage U5 — Defaults / tenant flip

**Prerequisite:** U4-live green on QA. **Product gate:** user explicitly says flip Creative Ballet (or target tenant) / new-tenant default.

---

## Scope IN (pick one — confirm with user)

**Option A — Single tenant flip (recommended first)**  
- Admin/SQL: set target tenant `payment_provider` + `invoicing_provider` = `invoice4u` via credential save RPC  
- No change to `provision_tenant` defaults yet  

**Option B — New IL tenants default to invoice4u**  
- Migration / seed: `provision_tenant` default `invoice4u`/`invoice4u`  
- Document Grow as legacy  

---

## Scope OUT

Deleting Grow/iCount code

---

## DoD

- [ ] Chosen option applied
- [ ] Smoke enrol on that tenant (QA or prod per user)
- [ ] SPEC / IMPLEMENTATION_STATUS note updated in same PR/session if user asks

**Stop.**

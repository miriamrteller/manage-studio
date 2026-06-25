# Plan: Unenrol — Phase 1 (Pre-payment cancellation)

| Field | Value |
| --- | --- |
| **Status** | ✅ **Complete** (shipped `20260608002300_engagement_actions.sql` + admin UI) |

## Verified against codebase (2026-06-02)

Cross-checked migrations `20260526000100`–`20260526002800`, `packages/shared`, enrolment/student features, and edge functions.

| Check | Result |
| --- | --- |
| Next migration slot | ✅ `20260526002900_*` (latest is `20260526002800_admin_enrolment_guardian.sql`) |
| Table name | ✅ `engagements` (not `enrolments`) |
| Status CHECK values | ✅ `pending_payment`, `active`, `admin_review`, `pending_offer`, `cancelled`, `withdrawn` — no `waitlisted` on engagements |
| `payment_received_at` column | ✅ exists on `engagements` |
| `payments.engagement_id` FK | ✅ exists; status CHECK includes `succeeded` |
| `audit_log` columns | ✅ `before_state`, `after_state` (no `metadata`) |
| RPC admin auth pattern | ✅ match `search_enrolment_students` / `admin_enrolment_lookup_email` |
| `GRANT EXECUTE` pattern | ✅ per-RPC in migration (not in `018`) |
| `EngagementSchema` in shared | ✅ matches; needs 3 new optional fields after migration |
| `pnpm db:types` | ✅ `packages/shared/src/database.types.ts` — run after migration |
| `pnpm -C packages/shared build` | ✅ required — web imports compiled `@shared/schemas` |
| Pay link guard | ✅ `EnrolPayPage` rejects non-`pending_payment`; `create-checkout` Edge Function also returns 403 if status ≠ `pending_payment` |
| `StudentSlideOver` size | ✅ ~443 lines — **must** extract new components |
| `Button` variant | ✅ `destructive` exists |
| `Dialog` pattern | ✅ `ContactPreferencesEditor.tsx` — no focus-trap library |
| i18n namespace | ✅ add under `pages.students.*` (see `en.json` line ~325) |
| Seed data | ⚠️ **No `engagements` rows in `seed.sql`** — manual tests require admin enrolment first |
| `BaseService.logAudit` | ⚠️ no-op — audit **must** be in RPC |
| **Re-enrol after cancel** | ❌ **Bug in current `EnrolmentService.create`** — duplicate check ignores terminal statuses; **fix required in Phase 1** |
| Bypass via `EnrolmentService.update` | ⚠️ admins can set any status today — **must** block `cancelled`/`withdrawn` in update schema |
| `STATUS_COLORS` in slide-over | ⚠️ missing `admin_review`, `pending_offer` — add when touching UI |
| Stale edge function | ℹ️ `create-payment-intent` references `enrolments`/`classes` tables — **not used**; app uses `create-checkout` + `engagements` |

---
| **Created** | 2026-06-02 |
| **Scope** | Admin cancels unpaid / not-yet-active enrolments |
| **Out of scope** | Refunds, post-payment withdrawal, parent self-service, waitlist automation (see [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)) |
| **Depends on** | Existing `engagements` table, `EnrolmentService`, `StudentSlideOver` |
| **SPEC refs** | §4.2.6 (engagements), §4.5 (financial immutability — not touched in Phase 1), §6.x backlog items 6–7 |

## Pre-flight (agent MUST read before coding)

1. **Table name is `engagements`** — not `enrolments`. Existing code sometimes logs `'enrolments'` to audit; use `'engagements'` for new work.
2. **Next migration filename:** `supabase/migrations/20260526002900_engagement_cancellation.sql` (after `20260526002800_*`). Do **not** use `20260602100000_*`.
3. **Payments FK column:** `payments.engagement_id` (not `enrolment_id`).
4. **`BaseService.logAudit` is currently a no-op** (console.debug only). Audit for Phase 1 must be an **`INSERT INTO audit_log` inside the RPC** (or a follow-up migration trigger). Do not mark audit DoD done unless RPC writes audit_log.
5. **UI cancel button visibility:** Client may only check engagement **status** ∈ cancellable set. Do **not** fetch payments in UI for Phase 1 — RPC enforces payment guards.
6. **Already `cancelled`:** Hide cancel button in UI; RPC idempotent path is for double-submit safety only.
7. **`EnrolPayPage`** already rejects non-`pending_payment` with `pages.enrol_pay.not_payable` — no change required, but verify manually.
8. **Dialog:** Use existing `@/components/ui/dialog` pattern from `ContactPreferencesEditor.tsx`. No focus-trap library — match existing dialog behaviour.
9. **Success feedback:** Use inline message or dialog close (no toast hook exists). Do not add a toast system in Phase 1.
10. **After migration:** run `pnpm db:sync` (linked remote) or `pnpm db:reset-local` (local Docker) then `pnpm db:types` and `pnpm -C packages/shared build`.
11. **Re-enrol after cancel:** fix `EnrolmentService.create` duplicate check (see Step 4b) — DoD depends on it.
12. **`create-checkout`** (not `create-payment-intent`) is the live payment path — already blocks cancelled engagements.

---

## Problem but cannot reverse a mistake or release a slot before payment. The schema already supports terminal statuses (`cancelled`, `withdrawn`) and partial unique indexes that allow re-enrolment, but:

- No validated status-transition layer (raw `EnrolmentService.update` accepts any status).
- No UI action on `StudentSlideOver`.
- No audit metadata (`cancelled_at`, reason, actor).

Phase 1 adds a **safe, idempotent “Cancel enrolment”** path for pre-payment statuses only.

---

## Semantic model (industry standard)

| Status | Meaning | Phase |
| --- | --- | --- |
| `cancelled` | Enrolment never became active — school/system initiated | **Phase 1** |
| `withdrawn` | Was active, family left mid-term | Phase 2 |

Do **not** use `cancelled` for post-payment exits. Do **not** delete `engagements` rows (audit + re-enrol uniqueness).

---

## Allowed transitions (Phase 1)

| From | To | Allowed | Guard |
| --- | --- | --- | --- |
| `pending_payment` | `cancelled` | ✅ | No `payment_received_at`; no succeeded payment row |
| `admin_review` | `cancelled` | ✅ | Same |
| `pending_offer` | `cancelled` | ✅ | Same |
| `active` | `cancelled` | ❌ | Use Phase 2 `withdrawn` flow |
| `active` | `withdrawn` | ❌ | Phase 2 |
| `cancelled` | `cancelled` | ✅ (idempotent) | RPC no-op: return row unchanged; UI hides button |
| `withdrawn` | * | ❌ | Terminal |
| Any | * | ❌ | If succeeded `payments` row exists for this engagement |

**Waitlist note:** Waiting list is stored in the separate `waitlist` table (not an engagement status in DB CHECK). Phase 1 does not remove waitlist rows; if a person has both, handle in a follow-up. Do not add `waitlisted` to engagement CHECK without a migration.

---

## Architecture decisions

1. **Dedicated domain module** — `apps/web/src/features/enrolment/lib/cancelEnrolment.ts` with pure transition validation + `EnrolmentCancellationService` (or methods on `EnrolmentService`) that orchestrates DB updates. Never call `update({ status: 'cancelled' })` from UI directly.

2. **Server-side enforcement** — Add a `SECURITY DEFINER` RPC `cancel_engagement(p_engagement_id UUID, p_reason TEXT)` so transitions cannot be bypassed via raw client updates. RLS still applies on SELECT; RPC validates tenant + admin role (match pattern in `search_enrolment_students`).

3. **Audit trail** — Migration adds nullable columns on `engagements`:
   - `cancelled_at TIMESTAMPTZ`
   - `cancellation_reason TEXT` (max 500 chars, Zod-validated)
   - `cancelled_by UUID REFERENCES user_profiles(id)` (nullable for system/dunning later)

4. **Financial safety** — RPC checks:
   - `payment_received_at IS NULL`
   - No related `payments` row with `status = 'succeeded'`
   Phase 1 must not create refund rows or mutate payments.

5. **Idempotency** — Cancelling an already-`cancelled` engagement returns success without error (same engagement id, same timestamps).

6. **Side effects (Phase 1 minimal)**:
   - `INSERT INTO audit_log` inside RPC (`action = 'UPDATE'`, `entity_type = 'engagements'`, `entity_id`, `actor_id = auth.uid()`, `tenant_id`)
   - Invalidate React Query keys (see below)
   - **Do not** implement waitlist offer (V2.2) — leave a `-- TODO: process-waiting-list` comment in RPC
   - **Known limitation:** Outstanding Stripe PaymentIntents are not voided in Phase 1. Payment page already blocks non-pending statuses. Document in PR if Stripe PI orphan is possible.

7. **UI** — Confirm dialog with optional reason; destructive styling; per-enrolment action in `StudentSlideOver` only (not bulk). Extract `CancelEnrolmentDialog.tsx` + `EnrolmentRowActions.tsx` — `StudentSlideOver` is already ~440 lines.

8. **Bypass prevention (required)** — In `EnrolmentInputSchema`, reject `status: 'cancelled' | 'withdrawn'` on update. JSDoc on `EnrolmentService.update`: use `EnrolmentCancellationService` for cancellation. Admins have `GRANT UPDATE ON engagements` (`018`) so the update path must not accept terminal transitions.

---

## Implementation steps (agent execution order)

### Step 1 — Migration

**File:** `supabase/migrations/20260526002900_engagement_cancellation.sql`

```sql
-- Phase 1: admin cancel pre-payment engagements

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES user_profiles(id);

CREATE OR REPLACE FUNCTION public.cancel_engagement(
  p_engagement_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_row engagements%ROWTYPE;
  v_old_status TEXT;
  v_reason TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_reason := NULLIF(trim(p_reason), '');

  SELECT * INTO v_row
  FROM engagements
  WHERE id = p_engagement_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  v_old_status := v_row.status;

  -- Idempotent: already cancelled
  IF v_row.status = 'cancelled' THEN
    RETURN to_jsonb(v_row);
  END IF;

  IF v_row.status NOT IN ('pending_payment', 'admin_review', 'pending_offer') THEN
    RAISE EXCEPTION 'Engagement cannot be cancelled from status %', v_row.status;
  END IF;

  IF v_row.payment_received_at IS NOT NULL THEN
    RAISE EXCEPTION 'Engagement already has payment recorded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM payments p
    WHERE p.engagement_id = v_row.id
      AND p.tenant_id = v_tenant_id
      AND p.status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'Engagement has a succeeded payment';
  END IF;

  UPDATE engagements
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now()),
    cancellation_reason = COALESCE(v_reason, cancellation_reason),
    cancelled_by = COALESCE(cancelled_by, auth.uid()),
    updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'UPDATE',
    'engagements',
    v_row.id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object(
      'status', 'cancelled',
      'cancellation_reason', v_reason,
      'transition', 'cancel_pre_payment'
    )
  );

  -- TODO: process-waiting-list Edge Function (V2.2)

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_engagement(UUID, TEXT) TO authenticated;
```

Verify `audit_log` columns against `supabase/migrations/20260526000600_audit_otp.sql` (`before_state` / `after_state`, not `metadata`).

Run: `pnpm db:sync` then `pnpm -C packages/shared build`.

### Step 2 — Shared schemas

**File:** `packages/shared/src/schemas.ts`

Extend `EngagementSchema` with optional (use existing shared types):

```typescript
cancelled_at: TimestampSchema.nullable().optional(),
cancellation_reason: z.string().max(500).nullable().optional(),
cancelled_by: UUIDSchema.nullable().optional(),
```

Add to `packages/shared/src/schemas.ts` (auto-exported via `index.ts`):

```typescript
export const CancelEnrolmentInputSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
```

Regenerate / update `packages/shared/src/database.types.ts` if types script exists.

### Step 3 — Domain logic (pure, unit-tested)

**File:** `apps/web/src/features/enrolment/lib/enrolmentTransitions.ts`

```typescript
export const CANCELLABLE_PRE_PAYMENT_STATUSES = [
  'pending_payment',
  'admin_review',
  'pending_offer',
] as const;

export type EngagementStatus = Engagement['status'];

export function canCancelPrePaymentEnrolment(input: {
  status: EngagementStatus;
  paymentReceivedAt: string | null | undefined;
  hasSucceededPayment: boolean;
}): { allowed: true; idempotent?: boolean } | { allowed: false; code: 'has_payment' | 'invalid_status' };
```

Rules:
- `pending_payment` | `admin_review` | `pending_offer` → `{ allowed: true }`
- `cancelled` → `{ allowed: false, code: 'invalid_status' }` (UI hides button; RPC handles double-submit)
- `active` | `withdrawn` → `{ allowed: false, code: 'invalid_status' }`
- Any status + `paymentReceivedAt` or `hasSucceededPayment` → `{ allowed: false, code: 'has_payment' }`

**Test file:** `apps/web/src/__tests__/enrolment-transitions.test.ts`

Cover:
- Each cancellable status → allowed
- `active` → rejected (`invalid_status`)
- `withdrawn` → rejected
- `cancelled` → rejected in UI helper (RPC idempotent separately)
- `payment_received_at` set → rejected (`has_payment`)

### Step 4 — Service layer

**File:** `apps/web/src/features/enrolment/lib/cancelEnrolment.ts` (or extend `EnrolmentService`)

```typescript
export class EnrolmentCancellationService {
  static async cancelPrePayment(
    _tenant: Tenant, // unused — RPC resolves tenant via auth.uid(); kept for service convention
    input: z.infer<typeof CancelEnrolmentInputSchema>,
  ): Promise<Engagement> {
    const validated = CancelEnrolmentInputSchema.parse(input);
    const { data, error } = await supabase.rpc('cancel_engagement', {
      p_engagement_id: validated.engagementId,
      p_reason: validated.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return EngagementSchema.parse(data);
  }
}
```

Do **not** use `EnrolmentService.update` for cancellation — RPC is the single write path. Do **not** call `logAudit` in service (RPC writes audit_log).

### Step 4b — Fix re-enrol after cancel (required)

**File:** `apps/web/src/features/enrolment/service.ts`

Current duplicate check (lines ~96–104) uses `.maybeSingle()` without excluding terminal statuses. After cancel, a `cancelled` row remains and **blocks re-enrolment** despite the partial unique index allowing a new row.

Fix: only treat as duplicate when a **non-terminal** engagement exists:

```typescript
const ACTIVE_STATUSES = ['pending_payment', 'active', 'admin_review', 'pending_offer'] as const;

const { data: existing, error: checkError } = await TenantDB.selectFor('engagements', tenant)
  .eq('person_id', validated.person_id)
  .eq('offering_id', validated.offering_id)
  .eq('season_id', validated.season_id)
  .in('status', [...ACTIVE_STATUSES])
  .maybeSingle();
```

Use the same `ACTIVE_STATUSES` list (or import from `enrolmentTransitions.ts`) — do not use `.not('status', 'in', ...)` (PostgREST syntax is error-prone).

Also add the same filter for the `season_id IS NULL` case if a duplicate check exists elsewhere.

**Test:** extend `apps/web/src/__tests__/enrolment-transitions.test.ts` or add service-level note in DoD manual step.

### Step 4c — Block terminal status via update (required)

**File:** `apps/web/src/features/enrolment/service.ts`

```typescript
const EnrolmentInputSchema = z.object({
  // ...existing fields...
  status: z.enum([...]).optional(),
}).refine(
  (data) => data.status == null || !['cancelled', 'withdrawn'].includes(data.status),
  { message: 'Use cancel_engagement RPC for cancellation' },
);
```

Or split create/update schemas if refine blocks legitimate seed paths (it should not — create never sets cancelled).

### Step 5 — React hook

**File:** `apps/web/src/features/enrolment/hooks/useCancelEnrolment.ts`

- `useMutation` wrapping `EnrolmentCancellationService.cancelPrePayment`
- `onSuccess` invalidates (prefix match — same pattern as `AdminEnrolStudentModal.tsx`):
  - `['student-detail-enrolments', tenantId, personId]`
  - `['students-list-enrolments', tenantId]` — partial key invalidates all personId variants
  - `['students', tenantId]`
  - `['all-enrolled-person-ids', tenantId]`
  - `['enrolments', tenantId]`
  - `['enrolled-person-ids', tenantId]` — class/level filter cache

### Step 6 — UI

**File:** `apps/web/src/features/students/components/StudentSlideOver.tsx`

For each enrolment row where status ∈ `CANCELLABLE_PRE_PAYMENT_STATUSES`:
- Show **Cancel enrolment** button (destructive / outline variant)
- **Do not** show for `cancelled`, `withdrawn`, or `active`

Extract to `apps/web/src/features/students/components/CancelEnrolmentDialog.tsx` and `EnrolmentRowActions.tsx`.

Opens confirm dialog (pattern: `ContactPreferencesEditor.tsx`):
  - Title: `pages.students.cancel_enrolment_title`
  - Body: class name + student name
  - Optional textarea: reason (max 500)
  - Confirm / Cancel buttons
- Loading + error state on mutation (inline error text, not toast)
- On success: close dialog; row shows `cancelled` badge (add `admin_review` / `pending_offer` to `STATUS_COLORS` if missing)

**Do not** show cancel for `active` enrolments (Phase 2).

Map RPC errors to i18n:
- `Engagement cannot be cancelled from status` → `cancel_enrolment_error_invalid_status`
- `payment recorded` / `succeeded payment` → `cancel_enrolment_error_has_payment`
- default → `common.error`

### Step 7 — i18n

**Files:** `apps/web/src/i18n/en.json`, `apps/web/src/i18n/he.json`

Keys (minimum):
- `pages.students.cancel_enrolment_button`
- `pages.students.cancel_enrolment_title`
- `pages.students.cancel_enrolment_confirm`
- `pages.students.cancel_enrolment_reason_label`
- `pages.students.cancel_enrolment_reason_placeholder`
- `pages.students.cancel_enrolment_success`
- `pages.students.cancel_enrolment_error_has_payment`
- `pages.students.cancel_enrolment_error_invalid_status`

### Step 8 — RLS verification

Confirm existing policy `"admins manage engagements"` allows UPDATE via RPC (`SECURITY DEFINER` with explicit tenant check). Add integration note in test or manual checklist — do not bypass RLS from client.

---

## Files touched (checklist)

| File | Action |
| --- | --- |
| `supabase/migrations/20260526002900_engagement_cancellation.sql` | Create |
| `apps/web/src/features/students/components/CancelEnrolmentDialog.tsx` | Create |
| `apps/web/src/features/students/components/EnrolmentRowActions.tsx` | Create |
| `apps/web/src/features/enrolment/service.ts` | Fix duplicate check (4b) + block terminal status on update (4c) |
| `packages/shared/src/schemas.ts` | Extend EngagementSchema |
| `apps/web/src/features/enrolment/lib/enrolmentTransitions.ts` | Create |
| `apps/web/src/features/enrolment/lib/cancelEnrolment.ts` | Create |
| `apps/web/src/features/enrolment/hooks/useCancelEnrolment.ts` | Create |
| `apps/web/src/features/students/components/StudentSlideOver.tsx` | Add cancel UI |
| `apps/web/src/__tests__/enrolment-transitions.test.ts` | Create |
| `apps/web/src/i18n/en.json` | Add keys |
| `apps/web/src/i18n/he.json` | Add keys |

---

## Verification (Definition of Done)

- [ ] Migration applies cleanly via `pnpm db:reset-local` or `pnpm db:sync`
- [ ] `pnpm -C packages/shared build` after schema/types update
- [ ] `pnpm run lint` passes
- [ ] `pnpm run test` passes (including new transition tests)
- [ ] Manual: create `pending_payment` enrolment via admin UI (seed has none)
- [ ] Manual: cancel → status `cancelled`, class tag removed from student list
- [ ] Manual: re-enrol same person + class + season succeeds (duplicate check fix)
- [ ] Manual: attempt cancel on `active` enrolment → RPC error
- [ ] Manual: attempt cancel after `AdminEnrolmentService.recordOfflinePayment` → RPC error
- [ ] Idempotent: double-cancel via RPC does not error; no duplicate audit rows
- [ ] RTL: dialog renders correctly in Hebrew
- [ ] Audit row in `audit_log` with `entity_type = 'engagements'` (query DB directly)
- [ ] No payment rows created or modified
- [ ] `/enrol/pay/:id` and `create-checkout` reject cancelled engagement

---

## Agent constraints (from CONTRIBUTING_AI)

- No raw status updates from components — use RPC + service only.
- No refund / Stripe logic in Phase 1.
- No new npm packages without Snyk + approval.
- Zod validate all inputs.
- Use logical CSS in new UI (`ms-*`, `pe-*`).
- File limit 250 lines — extract subcomponents if needed.

---

## Out of scope → tracked elsewhere

| Item | Tracker |
| --- | --- |
| Post-payment withdrawal + refund wizard | [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) — Unenrol Phase 2 |
| Parent-initiated withdrawal requests | IMPLEMENTATION_STATUS — Unenrol Phase 3 |
| Waitlist auto-offer on cancel | SPEC.md §V2.2 |
| Pro-rata refund policy engine | IMPLEMENTATION_STATUS — Unenrol Phase 2 |

---

## Suggested PR title

`feat(enrolment): admin cancel pre-payment enrolments (Phase 1)`

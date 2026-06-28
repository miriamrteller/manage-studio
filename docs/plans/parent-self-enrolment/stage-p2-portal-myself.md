# Stage P2 — Portal Myself section

**Prerequisites:** P1 complete (`resolveGuardianProfile` live).  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — portal data + UI contracts.

## Goal

Parent portal shows a dedicated **Myself** section: guardian name, enrolments, and self-enrol CTA. Guardian never appears anonymously in the children list.

## Scope IN

### 1. Extend `useParentPortal.ts`

**Import:** `resolveGuardianProfile` + `useCurrentUser`.

**In queryFn (order):**

1. Resolve guardian via `resolveGuardianProfile({ tenant, userProfileId: user.id, userEmail: user.email, userPersonId: user.person_id })`.
2. Set `guardian = result.status === 'found' ? result.profile : null`.
3. Set `guardianMissing = result.status === 'missing_person'`.
4. Load children: unchanged (`account_id != null`).
5. Build `personIds = [...children.map(c => c.id), ...(guardian ? [guardian.personId] : [])]`.
6. Fetch engagements with existing join shape for all `personIds`.
7. Populate `enrolmentsByPerson` for each id.

**Error handling:** If guardian resolve → `missing_account`, throw same user-facing error as today (`User not authenticated` / portal load failed). Do not crash on `missing_person`.

### 2. New `GuardianSelfSection.tsx`

**Path:** `apps/web/src/components/Dashboard/GuardianSelfSection.tsx`

**Props:**

```typescript
interface GuardianSelfSectionProps {
  guardian: GuardianProfile;
  enrolments: EngagementWithOffering[];
  highlightedEngagementId?: string;
  onEnrol: () => void;
}
```

- Reuse `EnrolmentRow` from `ParentPortal.tsx` — **extract** `EnrolmentRow` to `apps/web/src/components/Dashboard/EnrolmentRow.tsx` if needed to avoid circular imports (preferred).
- Section `aria-labelledby="portal-myself-heading"`.
- Container `id="portal-guardian-self"`.

### 3. Missing guardian card

When `guardianMissing && !guardian`:

```tsx
<div className="rounded-lg border border-dashed ...">
  <p>{t('pages.portal.myself_setup_required')}</p>
  <Button onClick={() => navigate('/enrol', { state: { from: '/dashboard/portal', mode: 'parent' } })}>
    {t('pages.portal.myself_setup_cta')}
  </Button>
</div>
```

### 4. Update `ParentPortal.tsx`

- Destructure `guardian`, `guardianMissing` from hook data.
- Insert `GuardianSelfSection` **after** header, **before** children section.
- Pass enrolments: `getVisibleEnrolments(guardian.personId)` when guardian present.
- `onEnrol`: navigate with CONTRACTS `EnrollmentIntent` shape.
- Update highlight scroll effect to support `portal-guardian-self` when highlight targets guardian enrolment.

### 5. i18n

Add CONTRACTS keys to `en.json` and `he.json` under `pages.portal`.

Hebrew translations (agent must add):

| Key | HE |
| --- | --- |
| `subtitle` | `צפייה בשיעורים שלך, בני משפחתך ובהיסטוריית התשלומים.` |
| `myself_heading` | `עצמי` |
| `myself_dob_missing` | `יש להוסיף תאריך לידה בעת הרשמה לשיעור למבוגרים.` |
| `myself_setup_required` | `השלימו את הפרופיל שלכם כדי להירשם לשיעורי מבוגרים.` |
| `myself_setup_cta` | `השלמת פרופיל` |
| `enrolments_for_self` | `ההרשמות שלי` |

### 6. Tests — `parent-portal-guardian.test.ts`

Pure tests only:

- `collectPortalPersonIds(children, guardianPersonId)` helper — returns unique ids including guardian.
- Optional: filter enrolments map keys.

## Scope OUT

- Enrolment step changes (P3)
- `ensureGuardianPersonForParent`
- Notification preferences

## Files allowed

```
apps/web/src/components/Dashboard/useParentPortal.ts
apps/web/src/components/Dashboard/ParentPortal.tsx
apps/web/src/components/Dashboard/GuardianSelfSection.tsx
apps/web/src/components/Dashboard/EnrolmentRow.tsx          # if extracted
apps/web/src/__tests__/parent-portal-guardian.test.ts
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
```

## Forbidden

- Adding guardian to `children` array
- Changing `filterStudentCandidates`
- SQL migrations

## DoD checklist

- [ ] Portal shows **Myself** section for seed parent Miriam
- [ ] Guardian enrolments visible (empty state uses `no_enrolments`)
- [ ] Enrol CTA navigates with `{ personId, from, mode: 'parent' }`
- [ ] `guardianMissing` shows setup card (verify manually or unit test flag logic)
- [ ] Children section unchanged; guardian not duplicated as child
- [ ] i18n en + he
- [ ] Lint + tests pass
- [ ] Invalidate `parent-portal` query still works after add-child flow

## Manual smoke

1. Login seed parent → see Myself above children.
2. Click Enrol on Myself → lands on enrolment with person pre-selected (skip person step).

## Stop condition

Post completion report. **Do not implement P3.**

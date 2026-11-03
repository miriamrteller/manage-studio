# Phase 1F — Notification blast composer (paste into new agent chat)

**Status:** **Ready** for automated implementation (hardened 2026-06-30)

## Mission

Build admin UI to **compose and send email announcements** to filtered recipients (all families / by level / by class). Use existing `send-notification` edge function + **Resend only** (no Twilio in V1). Trusted send path: edge re-resolves recipients server-side — never trust a client-supplied email list.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1F — *Notifications: compose email blast; select recipients by class/level/all*  
**Branch:** branch from `main` (independent of iCount / parent portal)  
**Depends on:** `send-notification` ✅ · `contact_preferences` ✅ · Resend pipeline ✅ · `notification_log` ✅  
**Out of scope:** AI draft (SPEC V2), per-tenant Resend keys (§6.x #4), WhatsApp blast (Step 8), parent `notify_*` UI (1G-b deferred — DB default `true` still applies)

---

## External dependencies (V1)

| Service | Required? | Notes |
| --- | --- | --- |
| **Resend** (`RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`) | **Yes** for live send smoke | Same as age-review / enrolment emails |
| **Twilio** | **No** | WhatsApp deferred |
| **Stripe / Grow / iCount** | **No** | |

Build + unit tests + preview RPC work **without** Resend. Manual send smoke needs Resend in edge env.

---

## Current state (verified 2026-06-30)

| Item | Status |
| --- | --- |
| `send-notification` | ✅ Single-recipient email; admin auth; `notification_log` insert |
| `NotificationPayloadSchema` | ✅ `packages/shared/src/schemas.ts` (transactional only) |
| Email templates | Transactional only — **no** `admin_announcement` |
| `preview_notification_blast_recipients` RPC | ❌ |
| Admin compose UI / route | ❌ |
| `notify_announcements` column | ✅ DB default `true`; no parent UI toggle yet (1G-b) |

---

## Locked semantics (V1)

| Rule | Value |
| --- | --- |
| **Channel** | Email only |
| **Recipient scope** | `all` \| `level` (`category_id`) \| `class` (`offering_id`) |
| **Who receives** | **Account primary contact** (`accounts.person_id`) for families where an enrolled student has `people.account_id` set |
| **Engagement filter** | Status ∈ `active`, `pending_payment`, `pending_waiver`, `admin_review`, `pending_offer` — scoped by `all` / level / class |
| **Eligibility** | Primary contact email non-empty AND `contact_preferences.email_opted_in` (default true if no row) AND `notify_announcements` (default true if no row) |
| **Dedup** | One email per **lowercase trimmed address** per blast |
| **Subject / body** | Admin plain text; subject max **200** chars; body min **10**, max **5000** |
| **Send model** | Preview (RPC) → confirm dialog → **one** edge invoke (`mode: 'admin_blast'`) that re-resolves + sends all |
| **Send cap** | Max **500** recipients per blast (edge returns 400 if preview count > 500) |
| **Audit** | One `notification_log` row per recipient send attempt |
| **Auth** | **`tenant_admin` or `super_admin` only** for preview RPC and blast send (**not** `staff`) |
| **Template** | `admin_announcement` → `EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT` |

---

## Hard rules

1. **New migration:** `supabase/migrations/20260626000400_notification_blast_rpcs.sql` — two functions (see Step 1).
2. Recipient resolution **only** via `resolve_notification_blast_recipients` (service role) / `preview_notification_blast_recipients` (authenticated admin wrapper). **Never** SELECT all emails client-side.
3. **Single trusted send path:** edge `mode: 'admin_blast'` re-runs `resolve_notification_blast_recipients` — do **not** accept client `recipients[]`.
4. `notification_log` uses **`recipient_account_member_id`** (not `family_member`).
5. Run `pnpm email:bundle` after new React email template; `pnpm -C packages/shared build` if shared schemas change.
6. Class dropdown uses **`useClasses`** (not `useOfferings`).
7. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `supabase/functions/send-notification/index.ts` — auth, email branch, `notification_log` insert
2. `supabase/migrations/20260608002200_admin_enrolment_rpcs.sql` — `admin_enrolment_lookup_email` auth pattern
3. `supabase/migrations/20260608000400_contact_prefs.sql` — `notify_announcements`
4. `supabase/migrations/20260608000600_communications.sql` — `notification_log` columns
5. `packages/shared/src/i18n/email.ts` + `packages/shared/src/email/render-template.ts`
6. `packages/shared/src/email-templates/EnrolmentConfirmationEmail.tsx` — layout pattern
7. `apps/web/src/features/enrolment/lib/sendAgeReviewNotifications.ts` — `supabase.functions.invoke` pattern
8. `apps/web/src/features/classes/hooks/useClasses.ts` + `apps/web/src/features/levels/hooks/useLevels.ts`
9. `apps/web/src/router.tsx` + `apps/web/src/components/Navigation/navigationConfig.ts`

---

## Step 1 — Migration: recipient RPCs

**File:** `supabase/migrations/20260626000400_notification_blast_rpcs.sql`

**Constants (comment in migration):**

```sql
-- In-scope engagement statuses for blast recipient resolution:
-- active, pending_payment, pending_waiver, admin_review, pending_offer
```

**Function A — internal resolver (service role only):**

```sql
CREATE OR REPLACE FUNCTION public.resolve_notification_blast_recipients(
  p_tenant_id UUID,
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;
  IF p_scope NOT IN ('all', 'level', 'class') THEN
    RAISE EXCEPTION 'Invalid scope: %', p_scope;
  END IF;
  IF p_scope = 'level' AND p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id required for level scope';
  END IF;
  IF p_scope = 'class' AND p_offering_id IS NULL THEN
    RAISE EXCEPTION 'offering_id required for class scope';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT DISTINCT ac.id AS account_id
    FROM engagements e
    INNER JOIN people student
      ON student.id = e.person_id AND student.tenant_id = e.tenant_id
    INNER JOIN accounts ac
      ON ac.id = student.account_id AND ac.tenant_id = e.tenant_id
    INNER JOIN offerings o
      ON o.id = e.offering_id AND o.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND student.account_id IS NOT NULL
      AND e.status IN (
        'active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer'
      )
      AND (
        p_scope = 'all'
        OR (p_scope = 'level' AND o.category_id = p_category_id)
        OR (p_scope = 'class' AND e.offering_id = p_offering_id)
      )
  ),
  candidates AS (
    SELECT
      lower(trim(contact.email)) AS email_key,
      trim(contact.email) AS recipient_email,
      contact.name AS recipient_name,
      contact.id AS person_id,
      am.id AS account_member_id,
      COALESCE(cp.email_opted_in, true) AS email_opted_in,
      COALESCE(cp.notify_announcements, true) AS notify_announcements
    FROM scoped s
    INNER JOIN accounts ac
      ON ac.id = s.account_id AND ac.tenant_id = p_tenant_id
    INNER JOIN people contact
      ON contact.id = ac.person_id AND contact.tenant_id = p_tenant_id
    LEFT JOIN account_members am
      ON am.account_id = ac.id
     AND am.person_id = contact.id
     AND am.role = 'account_holder'
    LEFT JOIN contact_preferences cp
      ON cp.person_id = contact.id
     AND cp.tenant_id = p_tenant_id
     AND cp.account_member_id IS NULL
    WHERE contact.email IS NOT NULL
      AND trim(contact.email) <> ''
  )
  SELECT DISTINCT ON (c.email_key)
    c.recipient_email,
    c.recipient_name,
    c.person_id,
    c.account_member_id
  FROM candidates c
  WHERE c.email_opted_in
    AND c.notify_announcements
  ORDER BY c.email_key, c.recipient_name;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_notification_blast_recipients(UUID, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_blast_recipients(UUID, TEXT, UUID, UUID) TO service_role;
```

**Function B — preview wrapper (web UI):**

```sql
CREATE OR REPLACE FUNCTION public.preview_notification_blast_recipients(
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
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

  RETURN QUERY
  SELECT * FROM public.resolve_notification_blast_recipients(
    v_tenant_id, p_scope, p_category_id, p_offering_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_notification_blast_recipients(TEXT, UUID, UUID) TO authenticated;
```

After migration: regenerate types if your workflow requires (`pnpm db:types` or project equivalent).

---

## Step 2 — Email template

**New:** `packages/shared/src/email-templates/AdminAnnouncementEmail.tsx`

- Props: `schoolName`, `language`, `colors`, `footerStrings`, `strings`, **`subject`**, **`body`** (plain text)
- Render `subject` as `<Heading>`, `body` in `<Text style={{ whiteSpace: 'pre-wrap' }}>` inside `BaseEmailTemplate`
- No merge fields beyond admin subject/body in V1

**Update:**

| File | Change |
| --- | --- |
| `packages/shared/src/i18n/email.ts` | `ADMIN_ANNOUNCEMENT: 'admin_announcement'` |
| `packages/shared/src/i18n/email-templates-en.json` | `"admin_announcement": { "preview": "Announcement from {schoolName}" }` |
| `packages/shared/src/i18n/email-templates-he.json` | Hebrew mirror |
| `packages/shared/src/email/render-template.ts` | Import + `switch` case; pass `subject: str(v.subject)`, `body: str(v.body)` |

```bash
pnpm email:bundle
```

**Send subject:** edge passes admin `subject` as `variables.subject` **and** `sendRenderedEmail({ subject: adminSubject, ... })` (existing pattern in `send-notification`).

---

## Step 3 — Edge function: `admin_blast` handler (locked)

**Modify:** `supabase/functions/send-notification/index.ts`

**Early in POST handler** (before generic single-recipient flow):

```typescript
interface AdminBlastPayload {
  mode: 'admin_blast';
  tenantId: string;
  scope: 'all' | 'level' | 'class';
  categoryId?: string;
  offeringId?: string;
  subject: string;
  body: string;
}
```

**Flow (`handleAdminAnnouncementBlast`):**

1. `requireAuthUser(req)` — reject if missing
2. Load profile; require **`tenant_admin` or `super_admin`** (reject `staff`-only)
3. Validate `payload.tenantId === profile.tenant_id`
4. Validate `subject` length 1–200, `body` length 10–5000
5. Validate scope params (`categoryId` if `level`, `offeringId` if `class`)
6. `service.rpc('resolve_notification_blast_recipients', { p_tenant_id, p_scope, p_category_id, p_offering_id })`
7. If `recipients.length > 500` → 400 `{ error: 'Too many recipients (max 500)' }`
8. If `recipients.length === 0` → 400 `{ error: 'No eligible recipients' }`
9. Load tenant email config once; loop recipients sequentially:
   - `sendRenderedEmail` with `EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT`, `variables: { subject, body, recipientName }`
   - Insert `notification_log` per attempt:

```typescript
await service.from('notification_log').insert({
  tenant_id: payload.tenantId,
  recipient_person_id: row.person_id,
  recipient_account_member_id: row.account_member_id,
  recipient_email: row.recipient_email,
  channel: 'email',
  template_name: EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT,
  subject: payload.subject,
  body_preview: payload.body.slice(0, 200),
  variables: { subject: payload.subject, body: payload.body },
  external_msg_id: result?.id ?? null,
  status: sent ? 'sent' : 'failed',
  failure_reason: failureReason ?? null,
  sent_at: new Date().toISOString(),
});
```

10. Return `{ sent, failed, total, errors?: string[] }`

**Do not** add Option A client `recipients[]` path.

---

## Step 4 — Web feature module

**New directory:** `apps/web/src/features/notifications-admin/`

| File | Purpose |
| --- | --- |
| `lib/notificationBlastSchema.ts` | Zod: scope, categoryId, offeringId, subject, body |
| `lib/notificationBlastConstants.ts` | `BLAST_MAX_RECIPIENTS = 500`, scope enum |
| `services/notificationBlastService.ts` | `previewRecipients`, `sendBlast` |
| `hooks/useNotificationBlast.ts` | preview query + send mutation |
| `components/RecipientPreviewTable.tsx` | email, name, count badge |
| `components/NotificationBlastForm.tsx` | full form |

**Service:**

```typescript
// previewRecipients
await supabase.rpc('preview_notification_blast_recipients', {
  p_scope: scope,
  p_category_id: scope === 'level' ? categoryId : null,
  p_offering_id: scope === 'class' ? offeringId : null,
});

// sendBlast
await supabase.functions.invoke('send-notification', {
  body: {
    mode: 'admin_blast',
    tenantId: tenant.id,
    scope,
    categoryId: scope === 'level' ? categoryId : undefined,
    offeringId: scope === 'class' ? offeringId : undefined,
    subject,
    body,
  },
});
```

**Page:** `apps/web/src/pages/NotificationsPage.tsx`

```tsx
export default function NotificationsPage() {
  return <NotificationBlastForm />;
}
```

**Route** — add to `router.tsx` with other admin routes:

```tsx
{ path: 'admin/notifications', element: <AdminRoute><NotificationsPage /></AdminRoute> },
```

**Nav** — `navigationConfig.ts`, **administration** section (after families):

```typescript
{
  path: '/admin/notifications',
  labelKey: 'nav.notifications',
  requiredRoles: ['tenant_admin'],
  sectionKey: 'administration',
},
```

---

## Step 5 — Form UX (locked)

1. **Scope** radio: All / Level / Class (`notificationBlastSchema`)
2. **Level** `<Select>` — `useLevels({ page: 1 })`; visible only when scope = `level`; value = `category.id`
3. **Class** `<Select>` — `useClasses({ page: 1 })`; visible only when scope = `class`; value = offering `id`, label = `name`
4. **Subject** — required, max 200
5. **Body** — textarea, required, min 10, max 5000
6. **Preview recipients** — calls RPC; renders `RecipientPreviewTable`; store count in state
7. **Send** — disabled until successful preview; if count > 500 show error (don't call edge)
8. **Confirm dialog** — `t('pages.notifications.confirm_send', { count })`
9. **Success** — toast with `{ sent, failed, total }` from edge response

Use `react-hook-form` + `@hookform/resolvers/zod`.

**Page shell:** match `FamiliesPage` — title + description from i18n, form in card.

---

## Step 6 — i18n

**Keys (minimum):**

```
nav.notifications
pages.notifications.title
pages.notifications.description
pages.notifications.scope_all
pages.notifications.scope_level
pages.notifications.scope_class
pages.notifications.level_label
pages.notifications.class_label
pages.notifications.subject_label
pages.notifications.body_label
pages.notifications.preview_button
pages.notifications.preview_count        // "{{count}} recipients"
pages.notifications.preview_empty
pages.notifications.preview_over_limit   // "Maximum {{max}} recipients per send"
pages.notifications.send_button
pages.notifications.confirm_send         // "Send to {{count}} recipients?"
pages.notifications.confirm_cancel
pages.notifications.send_success         // "Sent {{sent}} of {{total}}"
pages.notifications.send_partial           // "{{failed}} failed"
pages.notifications.error_generic
```

Mirror in `he.json`. Nest under existing `pages` / `nav` structure.

---

## Step 7 — Tests

**Unit:**

```bash
pnpm -C apps/web test notificationBlastSchema
pnpm -C packages/shared test render-template   # if existing pattern covers new case; else skip
```

Add `apps/web/src/__tests__/notificationBlastSchema.test.ts` — scope requires categoryId/offeringId, subject/body length bounds.

**Manual smoke** (needs Resend):

1. `/admin/notifications` → Preview **All** — count ≥ 0 in dev seed
2. Send to your own admin email — branded message received
3. `notification_log` rows for each recipient
4. Set a test contact `email_opted_in = false` — excluded from preview

---

## Step 8 — WhatsApp (defer)

Do **not** implement. Optional UI stub only if explicitly requested:

> WhatsApp announcements coming soon

Requires Twilio + Meta templates (§7) — out of V1.

---

## Definition of done

- [ ] Migration applied; preview RPC works for `all` / `level` / `class`
- [ ] `AdminAnnouncementEmail` bundled; `pnpm email:bundle` run
- [ ] `send-notification` `admin_blast` handler sends + logs with `recipient_account_member_id`
- [ ] `/admin/notifications` in router + nav
- [ ] Preview → confirm → send flow; 500 cap enforced in UI + edge
- [ ] i18n EN + HE
- [ ] Schema unit tests green
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` — notification blast → ✅

---

## File checklist

| Action | Path |
| --- | --- |
| New | `supabase/migrations/20260626000400_notification_blast_rpcs.sql` |
| Edit | `supabase/functions/send-notification/index.ts` |
| New | `packages/shared/src/email-templates/AdminAnnouncementEmail.tsx` |
| Edit | `packages/shared/src/i18n/email.ts` |
| Edit | `packages/shared/src/i18n/email-templates-en.json`, `email-templates-he.json` |
| Edit | `packages/shared/src/email/render-template.ts` |
| New | `apps/web/src/features/notifications-admin/**` (see Step 4) |
| New | `apps/web/src/pages/NotificationsPage.tsx` |
| Edit | `apps/web/src/router.tsx` |
| Edit | `apps/web/src/components/Navigation/navigationConfig.ts` |
| Edit | `apps/web/src/i18n/en.json`, `he.json` |
| New | `apps/web/src/__tests__/notificationBlastSchema.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |
| Run | `pnpm email:bundle` |

---

## Out of scope

- Client-supplied recipient lists
- WhatsApp / Twilio blast
- Scheduled sends, drafts, rich HTML editor
- Per-recipient merge fields beyond name in template
- Parent `notify_announcements` toggle UI (1G-b — separate plan)
- `staff` role sending blasts

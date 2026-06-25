# Phase 1F — Notification blast composer (paste into new agent chat)

## Mission

Build admin UI to **compose and send email announcements** to filtered recipients (all families / by level / by class). Use existing `send-notification` edge function + Resend. V1 is **email only**; WhatsApp blast is a follow-up.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1F — *Notifications: compose email blast; select recipients by class/level/all*  
**Depends on:** `send-notification` ✅ · `contact_preferences` ✅ · Resend templates pipeline ✅  
**Out of scope:** AI draft (SPEC V2), per-tenant Resend keys (§6.x #4), WhatsApp blast (Step 8 optional stub)

---

## Current state (verified 2026-06-25)

| Item | Status |
| --- | --- |
| `send-notification` | ✅ Routes email/WhatsApp; admin auth for most templates |
| `NotificationPayloadSchema` | ✅ `packages/shared/src/schemas.ts` |
| Email templates | Transactional only — **no admin announcement template** |
| Admin UI | ❌ No compose page or route |
| Recipient resolution | ❌ No RPC — must not query all emails client-side without tenant guard |

---

## Locked semantics (V1)

| Rule | Value |
| --- | --- |
| Channels V1 | **Email only** |
| Recipient scope | `all` \| `level` (category_id) \| `class` (offering_id) |
| Eligibility | Primary contact email exists AND `contact_preferences.email_opted_in = true` AND `notify_announcements = true` (default true in DB) |
| Dedup | One email per **unique email address** per blast (guardian may appear once even if multiple children) |
| Subject/body | Admin-entered plain text; body rendered in branded React email template |
| Send model | **Preview → confirm → send**; show recipient count before send |
| Audit | Insert row per send into `notification_log` (existing table) via edge function path |
| Rate limit | Batch in edge function — max **200 recipients per request**; UI loops batches with progress |

**Template name (locked):** `admin_announcement` → add to `EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT`

---

## Hard rules

1. **New migration:** `supabase/migrations/20260626000400_notification_blast_rpcs.sql`
2. Recipient resolution **must** be SECURITY DEFINER RPC — never expose cross-tenant emails via naive client SELECT.
3. Extend `send-notification` to accept `ADMIN_ANNOUNCEMENT` template; variables: `subject`, `body`, `schoolName`.
4. Admin-only: `tenant_admin` / `super_admin` (match existing send-notification auth).
5. Run `pnpm email:bundle` after new React email template.
6. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `supabase/functions/send-notification/index.ts` — auth, email branch, `notification_log` insert
2. `packages/shared/src/i18n/email.ts` — register template name
3. `packages/shared/src/email-templates/EnrolmentConfirmationEmail.tsx` — layout pattern
4. `supabase/migrations/20260608000400_contact_prefs.sql` — `notify_announcements`
5. `apps/web/src/features/enrolment/lib/sendAgeReviewNotifications.ts` — client invoke pattern
6. `apps/web/src/router.tsx` + `navigationConfig.ts` — add route + nav item

---

## Step 1 — Migration: recipient resolution RPC

**File:** `supabase/migrations/20260626000400_notification_blast_rpcs.sql`

```sql
CREATE OR REPLACE FUNCTION public.preview_notification_blast_recipients(
  p_scope TEXT,          -- 'all' | 'level' | 'class'
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID
)
-- Auth: tenant_admin/super_admin, tenant guard
-- Scope logic:
--   all: distinct billing contacts / account_members with email from active enrolments OR all families
--   level: engagements → offerings.category_id = p_category_id
--   class: engagements.offering_id = p_offering_id
-- Join contact_preferences; filter email_opted_in AND notify_announcements
-- DISTINCT ON (lower(recipient_email))
$$;

GRANT EXECUTE ON FUNCTION public.preview_notification_blast_recipients(TEXT, UUID, UUID) TO authenticated;
```

**Recipient source (locked for V1):** Prefer **account primary contact** (`accounts` → `people` / `account_members`) for families with any non-terminal engagement in scope. If no account email, skip row.

Document exact JOIN in migration comments; match patterns from `admin_enrolment_lookup_email` in `20260608002200_admin_enrolment_rpcs.sql`.

Optional second RPC `log_notification_blast` — only if edge function cannot write batch audit; prefer extending edge function.

---

## Step 2 — Email template

**Add:** `packages/shared/src/email-templates/AdminAnnouncementEmail.tsx`

- Props: `schoolName`, `subject`, `body` (plain text, preserve line breaks with `<br/>` or `white-space: pre-wrap`)
- Extend `BaseEmailTemplate`

**Update:**

- `packages/shared/src/i18n/email.ts` → `ADMIN_ANNOUNCEMENT: 'admin_announcement'`
- `packages/shared/src/i18n/email-templates-en.json` + `he.json` — default subject prefix optional
- `packages/shared/src/email/render-template.ts` — add case
- `supabase/functions/_shared/resend-send.ts` — ensure bundled dist includes template (via `pnpm email:bundle`)

```bash
pnpm email:bundle
```

---

## Step 3 — Edge function: batch send helper

**Modify:** `supabase/functions/send-notification/index.ts`

Add handler `handleAdminAnnouncementBatch` OR extend POST body schema:

```typescript
// Option A — new endpoint shape (preferred for batch):
{ mode: 'blast', tenantId, subject, body, recipients: [{ email, personId?, accountMemberId? }] }
```

- Validate admin auth + tenant match (existing pattern)
- Loop recipients (cap 200); call `sendRenderedEmail` with `ADMIN_ANNOUNCEMENT`
- Insert `notification_log` per recipient (copy existing insert block)
- Return `{ sent: number, failed: number, errors?: string[] }`

**Do not** trust client-supplied recipient list without re-validating emails belong to tenant — either re-call preview RPC server-side inside edge function or pass recipient IDs only and resolve in function with service role.

**Recommended:** Edge function accepts `scope + categoryId/offeringId + subject + body`, re-runs preview query with service client, sends — **single trusted path**.

---

## Step 4 — Web feature module

**New directory:** `apps/web/src/features/notifications-admin/`

| File | Purpose |
| --- | --- |
| `services/notificationBlastService.ts` | `previewRecipients`, `sendBlast` |
| `hooks/useNotificationBlast.ts` | form state, preview query, send mutation |
| `components/NotificationBlastForm.tsx` | scope selectors, subject, body, preview table |
| `components/RecipientPreviewTable.tsx` | email + name, count badge |

**Page:** `apps/web/src/pages/NotificationsPage.tsx` → `<NotificationBlastForm />`

**Route:** `/admin/notifications` in `router.tsx` (AdminRoute)

**Nav:** `navigationConfig.ts` — administration section, `labelKey: 'nav.notifications'`, `requiredRoles: ['tenant_admin']`

---

## Step 5 — Form UX (locked)

1. **Scope** radio: All / Level / Class
2. **Level** dropdown: `useLevels` or categories list (hidden unless level scope)
3. **Class** dropdown: active season offerings (`useOfferings` / existing classes hook)
4. **Subject** input (required, max 200)
5. **Body** textarea (required, min 10, max 5000)
6. **Preview recipients** button → RPC → table + count
7. **Send** button disabled until preview run; confirmation dialog: *"Send to N recipients?"*
8. Progress: if >200 recipients, chunk with `isSending` state

Use `react-hook-form` + zod schema `NotificationBlastFormSchema` in feature lib.

---

## Step 6 — i18n

**Keys:** `pages.notifications.*`, `nav.notifications` in `en.json` / `he.json`

Include: title, description, scope labels, preview, send, confirm dialog, success toast, error generic.

---

## Step 7 — Tests

**Unit:**

- `AdminAnnouncementEmail` render smoke (if existing email test pattern)
- `NotificationBlastFormSchema` validation

**Manual smoke:**

1. Preview `all` — count > 0 in dev seed
2. Send to your own email — receive branded message
3. `notification_log` row created
4. Parent with `email_opted_in = false` excluded

---

## Step 8 — WhatsApp (optional / defer)

If timeboxed: add disabled UI hint *"WhatsApp blast coming soon"* — do **not** half-ship Twilio bulk without template approval.

Future: second channel toggle, filter `whatsapp_opted_in AND whatsapp_verified`, reuse Twilio branch in `send-notification`.

---

## Definition of done

- [ ] RPC preview works for all three scopes
- [ ] New email template bundled and sent via edge function
- [ ] `/admin/notifications` reachable from nav
- [ ] Preview → confirm → send flow complete
- [ ] Audit rows in `notification_log`
- [ ] i18n EN + HE
- [ ] Update `docs/IMPLEMENTATION_STATUS.md`

---

## Out of scope

- Scheduled sends / drafts
- Rich HTML editor
- Per-recipient merge fields beyond name
- Parent unsubscribe link (future — use `notify_announcements` toggle in portal polish plan)

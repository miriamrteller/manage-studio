# Phase 1F — Notification log detail viewer (paste into new agent chat)

**Status:** ✅ Shipped (2026-07-05)

## Mission

Let tenant admins **open a delivery-history row** and read the **original message content** (subject + body) plus delivery metadata. Reuse data already stored in `notification_log` — **no migration**, no Resend API, no HTML re-render pipeline in the browser.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1F — *Notifications: notification log* (follow-on to [notification-log-page.md](notification-log-page.md))  
**Branch:** branch from `main`  
**Depends on:** History tab + `NotificationLog` ✅ · `useNotificationLog` ✅ · `notification_log.subject` / `variables` / `body_preview` ✅ · RLS `notification_log_admin_read` ✅  
**Out of scope:** Resend fetch by `external_msg_id` · client-side HTML email re-render · WhatsApp message body · export · edit/resend

---

## External dependencies

| Service | Required? |
| --- | --- |
| Resend / Twilio | **No** — read-only from DB |
| New env vars | **No** |
| SQL migration | **No** |

---

## Current state (verified 2026-07-05)

| Item | Status |
| --- | --- |
| History tab on `/admin/notifications` | ✅ |
| `NotificationLog.tsx` | Table only — no row action |
| `useNotificationLog.ts` | ✅ Paginated + channel/status filters |
| `notification_log` columns | `subject`, `body_preview`, `variables` (JSONB), `failure_reason`, `external_msg_id` |
| Admin blast logging | ✅ Stores `subject`, `body_preview` (200 chars), `variables: { subject, body }` |
| Transactional send logging | ✅ Stores `variables`; `subject` / `body_preview` often null |
| Client email render | ❌ Edge-only (`send-notification` / `resend-send.ts`) |

---

## Locked semantics (V1)

| Rule | Value |
| --- | --- |
| **Entry point** | Click table row **or** explicit “View” button in new Actions column — prefer **row click** + keyboard (Enter on focused row) for speed |
| **UI pattern** | `Dialog` from `@/components/ui/dialog` (same lightweight pattern as rest of app) |
| **Subject display** | `log.subject` → `variables.subject` (string) → em dash `—` |
| **Body display** | `variables.body` (string) → `body_preview` → fallback i18n `log_detail_body_unavailable` |
| **Body formatting** | Plain text in `<pre className="whitespace-pre-wrap">` or `<p>` with preserved line breaks — **not** rendered HTML |
| **Metadata block** | Recipient (email or phone), channel, template name, status badge, sent date (`sent_at ?? created_at`), `failure_reason` when status is `failed` or `bounced` |
| **Sensitive templates** | For `template_name === 'otp_code'`: **never** show `variables` body; show redacted copy `log_detail_body_redacted` only |
| **Multi-recipient rows** | Rare (e.g. age-review log uses comma-joined emails) — show recipient field as stored |
| **Auth** | Existing `tenant_admin` route guard + RLS — no new policies |
| **i18n** | All strings under `pages.notifications.log_detail_*` (EN + HE) |
| **RTL** | Dialog layout uses logical spacing (`ms-*`, `me-*`); mixed email/phone in `<bdi>` if needed |

---

## Hard rules

1. **No SQL migration.**
2. **Do not** add edge functions or Resend API calls.
3. **Do not** import `@shared/email` render pipeline into `apps/web` for this PR.
4. Keep `NotificationLog.tsx` under **150 lines** — extract `NotificationLogDetailDialog.tsx` if needed.
5. Detail opens from **data already in the list query** (`select('*')`) — no extra fetch unless row lacks body and you add optional single-row fetch (prefer inline data).
6. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `apps/web/src/components/shared/NotificationLog.tsx`
2. `apps/web/src/features/notifications/hooks/useNotificationLog.ts`
3. `packages/shared/src/schemas.ts` — `NotificationLogSchema`
4. `supabase/functions/send-notification/index.ts` — blast + transactional insert shapes (lines ~304–320, ~822–836)
5. `apps/web/src/components/ui/dialog.tsx`
6. `apps/web/src/i18n/en.json` / `he.json` — existing `pages.notifications.log_*` keys

---

## Step 1 — Pure helpers (testable)

**Create:** `apps/web/src/features/notifications/lib/notificationLogDetail.ts`

```typescript
import type { NotificationLog } from '@shared/schemas';

const REDACTED_TEMPLATES = new Set(['otp_code']);

export function isNotificationBodyRedacted(templateName: string): boolean {
  return REDACTED_TEMPLATES.has(templateName);
}

export function resolveNotificationLogSubject(log: NotificationLog): string | null {
  if (log.subject?.trim()) return log.subject.trim();
  const v = log.variables?.subject;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function resolveNotificationLogBody(log: NotificationLog): string | null {
  if (isNotificationBodyRedacted(log.template_name)) return null;
  const bodyVar = log.variables?.body;
  if (typeof bodyVar === 'string' && bodyVar.trim()) return bodyVar;
  if (log.body_preview?.trim()) return log.body_preview.trim();
  return null;
}
```

**Create:** `apps/web/src/__tests__/notification-log-detail.test.ts`

- `admin_announcement` row with `variables: { subject, body }` → resolves both
- Row with only `body_preview` → body from preview
- `otp_code` → body null, `isNotificationBodyRedacted` true
- Empty row → null subject/body

---

## Step 2 — Detail dialog component

**Create:** `apps/web/src/components/shared/NotificationLogDetailDialog.tsx`

Props:

```typescript
interface NotificationLogDetailDialogProps {
  log: NotificationLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Layout (top → bottom):

1. `DialogTitle` — `log_detail_title` (e.g. “Message details”)
2. Metadata grid (2 columns on `sm+`): recipient, date, channel, template, status
3. Subject line — label + value (or `—`)
4. Body section:
   - If redacted → `log_detail_body_redacted`
   - Else if body → pre-wrap text
   - Else → `log_detail_body_unavailable` + hint that transactional emails may not store full body yet
5. If `failure_reason` → alert/error styled block
6. Close button (`Dialog` close via `onOpenChange(false)`)

Reuse status badge classes from `NotificationLog.tsx` (extract shared `STATUS_BADGE_CLASSES` to `notificationLogDetail.ts` or small `notificationLogStatus.ts` if duplication bothers you — keep minimal).

---

## Step 3 — Wire into NotificationLog table

**Modify:** `apps/web/src/components/shared/NotificationLog.tsx`

1. `const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null)`
2. Table rows: `onClick={() => setSelectedLog(log)}`, `className` includes `cursor-pointer`, `role="button"`, `tabIndex={0}`, `onKeyDown` Enter/Space opens dialog
3. Optional: add narrow **Actions** column with text button `log_detail_view` for explicit affordance (screen readers)
4. Render `<NotificationLogDetailDialog log={selectedLog} open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)} />`

Do **not** change pagination or existing filters in this PR.

---

## Step 4 — i18n

**Add to `pages.notifications` in `en.json` / `he.json`:**

```json
"log_detail_title": "Message details",
"log_detail_view": "View",
"log_detail_subject": "Subject",
"log_detail_body": "Message",
"log_detail_body_unavailable": "Full message text was not stored for this notification.",
"log_detail_body_redacted": "Message content is hidden for security (one-time codes).",
"log_detail_recipient": "Recipient",
"log_detail_sent_at": "Sent",
"log_detail_failure": "Failure reason",
"log_detail_close": "Close"
```

Hebrew: mirror existing notification log tone.

---

## Step 5 — Tests + manual smoke

**Unit:** `notification-log-detail.test.ts` (Step 1)

**Manual:**

1. `/admin/notifications` → **History** → click a blast row (`admin_announcement`) → subject + full body visible
2. Click a **failed** row → failure reason shown
3. If seed has `otp_code` row → redacted message
4. Hebrew locale → dialog strings RTL-safe
5. Keyboard: focus row → Enter opens dialog → Escape or Close dismisses

---

## Definition of done

- [ ] Row click (or View action) opens detail dialog
- [ ] Admin blast rows show subject + full body from `variables`
- [ ] `otp_code` (and redacted set) never exposes code content
- [ ] Failed rows show `failure_reason`
- [ ] EN + HE i18n complete
- [ ] Unit tests for resolve helpers pass
- [ ] `pnpm -C apps/web run lint` + `pnpm -C apps/web test notification-log-detail` pass
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` — notification log detail viewer → ✅

---

## File checklist

| Action | Path |
| --- | --- |
| Create | `apps/web/src/features/notifications/lib/notificationLogDetail.ts` |
| Create | `apps/web/src/components/shared/NotificationLogDetailDialog.tsx` |
| Edit | `apps/web/src/components/shared/NotificationLog.tsx` |
| Edit | `apps/web/src/i18n/en.json`, `he.json` |
| Create | `apps/web/src/__tests__/notification-log-detail.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Follow-on (not this PR)

| Item | Plan |
| --- | --- |
| HTML preview for transactional templates | New plan: edge `preview-notification-log` or shared render in `packages/shared` |
| Resend “as delivered” fetch | Optional V2 — needs edge function + API key |
| Store `body_preview` consistently (500 chars per SPEC) | Small send-path tweak in `send-notification` |
| Recipient name in detail header | Join `people` by `recipient_person_id` |

# Phase 1F — Notification log viewer (paste into new agent chat)

**Status:** ✅ Shipped (2026-07-01)

## Mission

Mount the existing **`NotificationLog`** component on the admin notifications page so tenant admins can audit sent messages (including blast sends). Reuse **`useNotificationLog`** — add i18n, tabs UX, and small polish. **No migration.**

**Repo:** `manage-studio`  
**SPEC:** §Phase 1F — *Notifications: notification log*  
**Branch:** branch from `main`  
**Depends on:** `NotificationLog` ✅ · `useNotificationLog` ✅ · `/admin/notifications` (blast composer) ✅ · RLS `notification_log_admin_read` ✅  
**Out of scope:** Resend webhook status sync, export CSV, detail slide-over, WhatsApp delivery UI

---

## External dependencies

| Service | Required? |
| --- | --- |
| Resend / Twilio | **No** — read-only DB view |
| New env vars | **No** |

---

## Current state (verified 2026-07-01)

| Item | Status |
| --- | --- |
| `NotificationLog.tsx` | Built — **hardcoded EN**, not mounted |
| `useNotificationLog.ts` | ✅ Paginated query + channel/status filters |
| `NotificationsPage.tsx` | Renders `<NotificationBlastForm />` only |
| `/admin/notifications` route + nav | ✅ |
| `notification_log` RLS | ✅ `tenant_admin` SELECT |
| Blast composer | ✅ writes `notification_log` rows |

---

## Locked semantics (V1)

| Rule | Value |
| --- | --- |
| **Route** | Keep single route **`/admin/notifications`** — no `/log` sub-route |
| **Layout** | Page shell with **two tabs:** Compose \| History |
| **Default tab** | `compose` |
| **After blast send** | Switch to **`history`** tab + invalidate `notificationLog` query |
| **History table columns** | Date, Channel, Recipient, Template, Status |
| **Date display** | `sent_at ?? created_at` (local `toLocaleString`) |
| **Filters** | Channel + status (existing); keep voice option out of filter UI (email + whatsapp only) |
| **Pagination** | 25 per page (unchanged) |
| **Auth** | `tenant_admin` via existing route guard + RLS |
| **i18n** | All user-facing strings in `pages.notifications.log_*` keys |

---

## Hard rules

1. **No SQL migration.**
2. **Do not rewrite** `useNotificationLog` unless fixing a bug — mount + i18n + columns only.
3. Reuse `@/components/ui/tabs` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`).
4. Move page **title + description** to `NotificationsPage` — remove duplicate `<h1>` from `NotificationBlastForm`.
5. Fix **`NotificationLogSchema`**: `sent_at` nullable; add optional `created_at` (matches DB).
6. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `apps/web/src/pages/NotificationsPage.tsx`
2. `apps/web/src/features/notifications-admin/components/NotificationBlastForm.tsx`
3. `apps/web/src/components/shared/NotificationLog.tsx`
4. `apps/web/src/features/notifications/hooks/useNotificationLog.ts`
5. `packages/shared/src/schemas.ts` — `NotificationLogSchema`
6. `apps/web/src/components/ui/tabs.tsx`
7. `supabase/migrations/20260608000600_communications.sql` — `notification_log` columns

---

## Step 1 — Schema alignment (minimal)

**Modify:** `packages/shared/src/schemas.ts`

```typescript
export const NotificationLogSchema = z.object({
  // ...existing fields...
  status: z.enum(['sent', 'delivered', 'read', 'failed', 'bounced', 'pending']).default('sent'),
  created_at: TimestampSchema.optional(),
  sent_at: TimestampSchema.nullable().optional(),
});
```

Run if other packages depend on it: `pnpm -C packages/shared build`

---

## Step 2 — Tabbed notifications page

**Modify:** `apps/web/src/pages/NotificationsPage.tsx`

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationLog } from '@/components/shared/NotificationLog';
import { NotificationBlastForm } from '@/features/notifications-admin/components/NotificationBlastForm';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'compose' | 'history'>('compose');

  const handleBlastSent = () => {
    void queryClient.invalidateQueries({ queryKey: ['notificationLog'] });
    setTab('history');
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.notifications.title')}</h1>
        <p className="text-gray-600">{t('pages.notifications.description')}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'compose' | 'history')}>
        <TabsList>
          <TabsTrigger value="compose">{t('pages.notifications.tab_compose')}</TabsTrigger>
          <TabsTrigger value="history">{t('pages.notifications.tab_history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="pt-4">
          <NotificationBlastForm onSentSuccess={handleBlastSent} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <NotificationLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Modify:** `pages.notifications.title` / `description` in i18n to cover **both** compose + history (see Step 4).

---

## Step 3 — Blast form: drop page header + callback

**Modify:** `apps/web/src/features/notifications-admin/components/NotificationBlastForm.tsx`

1. Add optional prop:

```typescript
interface NotificationBlastFormProps {
  onSentSuccess?: () => void;
}
```

2. **Remove** the outer block:

```tsx
<div className="space-y-2">
  <h1>...</h1>
  <p>...</p>
</div>
```

3. After successful `handleSend`, call `onSentSuccess?.()` **after** setting success message.

---

## Step 4 — i18n: NotificationLog + tabs

**Modify:** `apps/web/src/components/shared/NotificationLog.tsx`

- Add `useTranslation()`
- Replace all hardcoded strings with keys below
- Add **Template** column: `{log.template_name}` (truncate with `title` attr if long)
- Date cell:

```tsx
const at = log.sent_at ?? log.created_at;
// ...
{at ? new Date(at).toLocaleString() : '—'}
```

- Use existing table/button patterns; replace inline `style={{ backgroundColor: ... }}` status badges with Tailwind classes matching other admin tables (`bg-green-100 text-green-800`, etc.) if trivial; otherwise keep behavior, i18n only.

**Update `pages.notifications` in `en.json` / `he.json`:**

```json
"title": "Notifications",
"description": "Send email announcements and review delivery history for your studio.",
"tab_compose": "Compose",
"tab_history": "History",
"log_heading": "Delivery history",
"log_channel": "Channel",
"log_status": "Status",
"log_recipient": "Recipient",
"log_template": "Template",
"log_date": "Date",
"log_channel_all": "All channels",
"log_channel_email": "Email",
"log_channel_whatsapp": "WhatsApp",
"log_status_all": "All statuses",
"log_status_sent": "Sent",
"log_status_delivered": "Delivered",
"log_status_failed": "Failed",
"log_loading": "Loading…",
"log_empty": "No notifications yet.",
"log_error": "Failed to load notification log.",
"log_previous": "Previous",
"log_next": "Next",
"log_page": "Page {{page}} of {{pageCount}}"
```

Keep existing blast keys (`scope_all`, `send_button`, etc.) unchanged.

**Nav label:** optional tweak `nav.notifications` → `"Notifications"` (EN) if still `"Send announcement"`.

---

## Step 5 — Tests + manual smoke

**Unit:** Update `apps/web/src/__tests__/schemas.test.ts` — `NotificationLogSchema` accepts row with `sent_at: null` + `created_at` set.

**Manual:**

1. `/admin/notifications` → **History** tab → table loads (may be empty)
2. **Compose** tab → send test blast (or use seed) → auto-switches to **History** → new rows with `admin_announcement`
3. Channel/status filters work
4. Hebrew locale: tab labels + log strings

---

## Definition of done

- [ ] `/admin/notifications` has Compose + History tabs
- [ ] `NotificationLog` fully i18n (EN + HE)
- [ ] Template column visible; date uses `sent_at ?? created_at`
- [ ] Successful blast invalidates log + switches to History tab
- [ ] `NotificationLogSchema` accepts nullable `sent_at`
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` — notification log viewer → ✅

---

## File checklist

| Action | Path |
| --- | --- |
| Edit | `packages/shared/src/schemas.ts` |
| Edit | `apps/web/src/pages/NotificationsPage.tsx` |
| Edit | `features/notifications-admin/components/NotificationBlastForm.tsx` |
| Edit | `components/shared/NotificationLog.tsx` |
| Edit | `apps/web/src/i18n/en.json`, `he.json` |
| Edit | `apps/web/src/__tests__/schemas.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |
| Run | `pnpm -C packages/shared build` (if schema changed) |

---

## Out of scope

- Separate `/admin/notifications/log` route
- Editing/deleting log rows
- Webhook-driven status updates (`twilio-webhook-status`)
- Notification log nav item (tabs share existing nav entry)

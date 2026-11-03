# Phase 1F — Notification log recipient search (paste into new agent chat)

**Status:** ✅ Shipped (2026-07-05)

## Mission

Add a **recipient search** filter to the notification delivery history table so admins can find rows by **email or phone**. Extend `useNotificationLog` with a debounced `recipientQuery` filter — **no migration** for V1.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1F — *Notifications: notification log* (follow-on to [notification-log-page.md](notification-log-page.md))  
**Branch:** branch from `main`  
**Depends on:** History tab + `useNotificationLog` ✅ · `notification_log.recipient_email` / `recipient_phone` ✅ · RLS `notification_log_admin_read` ✅  
**Out of scope:** Search by person **name** (follow-on) · subject/body full-text search · DB index migration · export

---

## External dependencies

| Service | Required? |
| --- | --- |
| Resend / Twilio | **No** |
| New env vars | **No** |
| SQL migration | **No** (V1) |

---

## Current state (verified 2026-07-05)

| Item | Status |
| --- | --- |
| `NotificationLog.tsx` | Channel + status dropdowns only — **no search input** |
| `useNotificationLog.ts` | Filters: `channel`, `status`, pagination, sort |
| `notification_log` indexes | `tenant_id`, `created_at`, `status`, `channel` — **no** `recipient_email` index |
| Prior art | `usePersonSearch` (debounce 300ms) · `PaymentsLogService.searchPayerPersonIds` (name → person_id) |

---

## Locked semantics (V1)

| Rule | Value |
| --- | --- |
| **Search fields** | `recipient_email` and `recipient_phone` only |
| **Match type** | Case-insensitive substring (`ilike '%query%'`) |
| **Empty query** | No filter applied (show all, same as today) |
| **Debounce** | **300ms** before query refetch (match `usePersonSearch`) |
| **Pagination** | Reset to **page 1** when query changes |
| **Query key** | Include `recipientQuery` in React Query `queryKey` |
| **Supabase filter** | `.or(\`recipient_email.ilike.%${q}%,recipient_phone.ilike.%${q}%\`)` on **both** data and count queries |
| **Sanitization** | Trim whitespace; if trimmed length === 0, skip filter. **Do not** pass raw `%` or `_` unescaped — strip or escape PostgREST special chars (minimal: reject queries containing only `%`/`_`, or escape `%` → `\%` per PostgREST docs) |
| **UI placement** | Third filter control above table — full width on mobile, shares row with channel/status on `md+` (grid `grid-cols-1 md:grid-cols-3`) |
| **Placeholder** | “Email or phone” (i18n) |
| **No results** | Existing `log_empty` when zero rows; optional distinct `log_search_empty` if query active and zero matches |
| **Auth** | Unchanged — `tenant_admin` + RLS |

---

## Hard rules

1. **No SQL migration** in V1.
2. Apply the **same** `recipientQuery` filter to the **count** query and the **data** query (bug if counts diverge).
3. **Do not** client-side filter paginated results — server-side only.
4. Reuse existing `Input` or plain `<input className="...">` matching filter styling in `NotificationLog.tsx`.
5. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `apps/web/src/features/notifications/hooks/useNotificationLog.ts`
2. `apps/web/src/components/shared/NotificationLog.tsx`
3. `apps/web/src/features/people/hooks/usePersonSearch.ts` — debounce pattern
4. `apps/web/src/features/finance-admin/services/paymentsLogService.ts` — `searchPayerPersonIds` (name search follow-on only)
5. `apps/web/src/__tests__/notifications.hooks.test.ts`

---

## Step 1 — Hook: recipient query option

**Modify:** `apps/web/src/features/notifications/hooks/useNotificationLog.ts`

1. Extend `UseNotificationLogOptions`:

```typescript
recipientQuery?: string;
```

2. Add helper (same file or `notificationLogQuery.ts`):

```typescript
function normalizeRecipientQuery(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return undefined;
  // PostgREST ilike: escape % and _ in user input
  return trimmed.replace(/[%_]/g, '\\$&');
}

function applyRecipientFilter<T extends { or: (...args: string[]) => T }>(
  query: T,
  recipientQuery: string | undefined,
): T {
  const q = normalizeRecipientQuery(recipientQuery);
  if (!q) return query;
  return query.or(`recipient_email.ilike.%${q}%,recipient_phone.ilike.%${q}%`);
}
```

3. Apply to both `queryBuilder` and `countQuery` after tenant_id eq.
4. Add `recipientQuery` to `queryKey` array.

**Optional:** Accept debounced value from caller (component owns debounce) — **recommended**: debounce in component, pass stable debounced string to hook.

---

## Step 2 — Debounced search state in UI

**Modify:** `apps/web/src/components/shared/NotificationLog.tsx`

1. `const [recipientSearch, setRecipientSearch] = useState('')`
2. `const [debouncedRecipientSearch, setDebouncedRecipientSearch] = useState('')`
3. `useEffect` 300ms debounce (copy pattern from `usePersonSearch`)
4. Pass `recipientQuery: debouncedRecipientSearch` to `useNotificationLog`
5. `onChange` on input → `setRecipientSearch` + `setPage(1)` when debounced value updates (reset page in debounce effect when value changes)

**UI:**

```tsx
<label htmlFor="recipient-search" className="block text-sm font-medium mb-2">
  {t('pages.notifications.log_search_recipient')}
</label>
<input
  id="recipient-search"
  type="search"
  value={recipientSearch}
  onChange={(e) => setRecipientSearch(e.target.value)}
  placeholder={t('pages.notifications.log_search_recipient_placeholder')}
  className="w-full px-3 py-2 border rounded"
  autoComplete="off"
/>
```

6. Change filter grid from `grid-cols-2` → `grid-cols-1 md:grid-cols-3`

7. Empty state: when `debouncedRecipientSearch` is non-empty and `logs.length === 0`, show `log_search_empty` instead of generic `log_empty`

---

## Step 3 — i18n

**Add to `pages.notifications` in `en.json` / `he.json`:**

```json
"log_search_recipient": "Search recipient",
"log_search_recipient_placeholder": "Email or phone",
"log_search_empty": "No notifications match this search."
```

Hebrew: align with existing `recipient_list_search_placeholder` wording where sensible.

---

## Step 4 — Tests

**Create or extend:** `apps/web/src/__tests__/notification-log-search.test.ts`

Unit-test `normalizeRecipientQuery` and/or `applyRecipientFilter` logic (pure functions extracted in Step 1):

- Empty / whitespace → no filter
- `miriam@gmail.com` → passes through
- `100%` → escaped `%` in pattern (or rejected — document chosen behavior)

**Extend:** `notifications.hooks.test.ts` — placeholder describe block for `recipientQuery` filter (optional smoke; full hook test needs Supabase mock).

---

## Step 5 — Manual smoke

1. History tab → type partial email → table filters, page resets to 1
2. Clear search → full list returns
3. Channel + status + search **combined** — all filters AND together
4. Pagination with active search — page 2 respects filter
5. Hebrew UI — label + placeholder

---

## Definition of done

- [ ] Search input above delivery history table
- [ ] 300ms debounced filter on `recipient_email` + `recipient_phone`
- [ ] Count query matches data query
- [ ] Page resets to 1 on search change
- [ ] Distinct empty message when search active
- [ ] EN + HE i18n
- [ ] Unit tests for query normalization
- [ ] `pnpm -C apps/web run lint` + tests pass
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` — notification log recipient search → ✅

---

## File checklist

| Action | Path |
| --- | --- |
| Edit | `apps/web/src/features/notifications/hooks/useNotificationLog.ts` |
| Create (optional) | `apps/web/src/features/notifications/lib/notificationLogQuery.ts` |
| Edit | `apps/web/src/components/shared/NotificationLog.tsx` |
| Edit | `apps/web/src/i18n/en.json`, `he.json` |
| Create | `apps/web/src/__tests__/notification-log-search.test.ts` |
| Edit | `apps/web/src/__tests__/notifications.hooks.test.ts` (optional) |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Follow-on — search by person name (not V1)

| Step | Work |
| --- | --- |
| 1 | On debounced query, if looks like email/phone (`@` or `+`) → current ilike path |
| 2 | Else → `people` lookup `.ilike('name', …)` (max 100 ids) → `.in('recipient_person_id', ids)` |
| 3 | Migration (optional) | `CREATE INDEX idx_notification_log_recipient_email ON notification_log (tenant_id, recipient_email text_pattern_ops)` if log volume grows |

Pattern: `PaymentsLogService.searchPayerPersonIds` + `filters.personIds` on payments log.

---

## Performance note

At typical studio volume (hundreds–low thousands of rows per tenant), `ilike` on `recipient_email` without a dedicated index is acceptable. Add index migration only if profiling shows slow History tab loads.

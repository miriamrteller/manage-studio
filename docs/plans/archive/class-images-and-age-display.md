# Plan: Class cover images + age display on cards and admin table



**Status:** Ready for implementation (hardened)  

**Estimated effort:** ~1 day (age display ~30m remaining, images ~6–7h)  

**Branch suggestion:** `feat/class-images-and-age-display`



---



## Goal



1. **Age display** — Show `min_age` / `max_age` on the public `ClassCard` and the admin **Manage Classes** table.

2. **Cover images** — Let admins upload a cover photo per class; show it on public `ClassCard` with a neutral placeholder when missing.



---



## Progress (as of last plan update)



| Item | Status |

|------|--------|

| `formatClassAgeRange.ts` + tests | ✅ Done |

| i18n age keys (`ages_range`, etc.) | ✅ Done |

| `ClassCard` age row | ✅ Done |

| `AdminClassesList` Ages column | ❌ Not started |

| Image infrastructure (Phases B–D) | ❌ Not started |



---



## Current state (do not re-discover)



| Area | State |

|------|--------|

| DB columns | `offerings.min_age`, `offerings.max_age` exist (`20260526000400_offerings.sql`) |

| Public RPC | `get_public_offerings_by_subdomain` returns `min_age`, `max_age` (`20260602000000_public_offerings_season_start.sql`) |

| Schemas | `PublicOfferingSchema` and `OfferingSchema` include `min_age` / `max_age` |

| Admin form | `ClassForm` already edits `min_age` / `max_age` |

| ClassCard | Shows time, level, **age**, price — **no image yet** |

| Admin table | No age column, no image |

| Storage | **None configured** |

| Age formatter | `apps/web/src/features/classes/lib/formatClassAgeRange.ts` (i18n-aware) |



---



## Locked decisions (do not re-debate during implementation)



These defaults are industry-standard for V1 and match the codebase. Implement as written unless the product owner overrides an **Open question** below.



| Decision | Choice | Rationale |

|----------|--------|-----------|

| Bucket visibility | **Public read** | Class cards are shown to anon users on `/classes` |

| Path in DB | **Storage path, not URL** | Environment-agnostic; client builds public URL |

| Canonical filename | **Always `cover.webp`** | Single extension; avoids orphan files on replace |

| Output size | **Max 1200px on longest edge**, WebP quality 0.85 | Balance quality vs bandwidth |

| Max input decode | **Reject if either dimension > 4096px** | Mitigate decompression bombs |

| Who can upload | **`tenant_admin` only** | Matches offerings RLS |

| `cover_image_path` in forms | **Never via generic class payload** | Prevents path injection; set only after upload |

| Cache busting | **`?v={updated_at}`** on public URL | Same path upsert would otherwise show stale image |

| Upload orchestration | **`ClassForm` owns file state**; `AdminClassesList.handleFormSubmit` orchestrates create → upload → path update | Keeps form UI colocated with file input |

| Partial create failure | **Keep class row; show upload error** | Safer than deleting a successfully created class (see Open questions) |

| Placeholder | **Empty gray block, no text** | Decorative; class name is in heading |

| Super-admin storage | **Include bypass policies** | Matches pattern on all other tables |



---



## Open questions (need product answer before starting images)



Implementer: if no answer is given, use **Default** column.



| # | Question | Default | Impact |

|---|----------|---------|--------|

| Q1 | If image upload fails after class is created, should we **delete the new class** or **keep it without an image**? | **Keep class**, show error, admin can re-edit | C2 error handling |

| Q2 | Placeholder: plain gray box or show studio/level hint (e.g. muted icon)? | **Plain gray** (`bg-gray-100`, no label) | D1 markup |

| Q3 | Include a **thumbnail column** on the admin Manage Classes table in this PR? | **No** — card preview in edit form only | Scope |

| Q4 | Should **non-public** classes (`is_public = false`) still allow cover images (for admin preview only)? | **Yes** — upload allowed; image only visible to those who can see the class listing | No extra RLS needed if bucket is public* |



\*Public bucket means URLs are technically guessable if someone knows `tenant_id` + `offering_id`. Acceptable for V1 marketing photos. Switch to private bucket + signed URLs in a follow-up if needed.



**No other ambiguities block implementation.** Age display remaining work is fully specified.



---



## Out of scope



- Category-level default images

- Image cropping UI (CSS `object-cover` only)

- Enrolment stepper class picker images

- Sorting admin table by age

- Server-side image transforms / CDN config

- Tenant-deletion storage sweep (follow-up)

- Orphan storage sweeper job (follow-up)



---



## Pre-implementation hardening checklist



All items below are **required** — not optional follow-ups.



- [ ] Storage RLS validates **offering exists** and belongs to tenant (not just folder prefix)

- [ ] Storage UPDATE policies include **WITH CHECK** mirroring INSERT

- [ ] **`super_admin`** bypass policies on storage.objects (INSERT/UPDATE/DELETE/SELECT)

- [ ] **`cover_image_path` excluded** from `ClassInputSchema` / react-hook-form; dedicated `ClassService.setCoverImagePath(tenant, id, path \| null)` or internal update method only

- [ ] Upload always writes **`{tenant_id}/{offering_id}/cover.webp`**; delete previous path if different before upload

- [ ] **Rollback**: if DB path update fails after upload, delete the new storage object

- [ ] **Delete class**: `get()` → delete storage object → delete DB row (in that order)

- [ ] **Cache bust**: append `?v=${updated_at}` when building public URL (pass `updated_at` from offering or RPC)

- [ ] Client validates **magic bytes** + re-encodes via canvas (not just `file.type`)

- [ ] Reject decoded dimensions **> 4096px** on either axis



---



## Phase A — Age display (UI only)



### A1. Shared age display helper — ✅ DONE



`apps/web/src/features/classes/lib/formatClassAgeRange.ts` + tests + i18n keys.



### A2. ClassCard — ✅ DONE



Age row rendered when `min_age` and/or `max_age` set.



### A3. AdminClassesList — add Ages column — ❌ TODO



**File:** `apps/web/src/features/classes/components/AdminClassesList.tsx`



1. Import `formatClassAgeRange` from `@/features/classes/lib/formatClassAgeRange`

2. Add `<th>` after Level: `{t('pages.classes.ages')}`

3. Add `<td>`:

   ```tsx

   {formatClassAgeRange(t, classItem.min_age, classItem.max_age) ?? '—'}

   ```

4. Update expanded requirements row `colSpan={8}` → `colSpan={9}`



### A4. Tests — ✅ DONE



`apps/web/src/features/classes/lib/formatClassAgeRange.test.ts`



### Phase A acceptance criteria



- [x] Public class card shows ages when configured

- [x] Card omits age row when both null

- [ ] Admin table has Ages column with same formatting

- [x] No migration required for age display



---



## Phase B — Database + storage infrastructure



### B1. Migration



**New file:** `supabase/migrations/20260602100000_offering_cover_images.sql`



```sql

-- Add cover image path to offerings (storage path, not full URL)

ALTER TABLE offerings

  ADD COLUMN IF NOT EXISTS cover_image_path TEXT;



COMMENT ON COLUMN offerings.cover_image_path IS

  'Supabase Storage object path: {tenant_id}/{offering_id}/cover.webp. Set only via upload flow.';



-- Optional integrity: path must match row id + tenant when set

ALTER TABLE offerings

  ADD CONSTRAINT offerings_cover_image_path_format CHECK (

    cover_image_path IS NULL

    OR cover_image_path = tenant_id::text || '/' || id::text || '/cover.webp'

  );



-- Storage bucket (public read for anon class cards)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)

VALUES (

  'offering-images',

  'offering-images',

  true,

  2097152,  -- 2 MB

  ARRAY['image/jpeg', 'image/png', 'image/webp']

)

ON CONFLICT (id) DO NOTHING;



-- Helper expression reused in policies: offering_id segment matches a real offering in caller's tenant

-- Path layout: {tenant_id}/{offering_id}/cover.webp

-- storage.foldername(name)[1] = tenant_id, [2] = offering_id



CREATE POLICY "Public read offering images"

  ON storage.objects FOR SELECT

  USING (bucket_id = 'offering-images');



CREATE POLICY "Super admin all offering images"

  ON storage.objects FOR ALL

  USING (bucket_id = 'offering-images' AND is_super_admin())

  WITH CHECK (bucket_id = 'offering-images' AND is_super_admin());



CREATE POLICY "Admins insert offering images"

  ON storage.objects FOR INSERT

  WITH CHECK (

    bucket_id = 'offering-images'

    AND (storage.foldername(name))[1] = get_my_tenant_id()::text

    AND (storage.foldername(name))[3] = 'cover.webp'

    AND EXISTS (

      SELECT 1 FROM offerings o

      WHERE o.id = (storage.foldername(name))[2]::uuid

        AND o.tenant_id = get_my_tenant_id()

    )

    AND EXISTS (

      SELECT 1 FROM user_profiles

      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)

    )

  );



CREATE POLICY "Admins update offering images"

  ON storage.objects FOR UPDATE

  USING (

    bucket_id = 'offering-images'

    AND (storage.foldername(name))[1] = get_my_tenant_id()::text

    AND EXISTS (

      SELECT 1 FROM offerings o

      WHERE o.id = (storage.foldername(name))[2]::uuid

        AND o.tenant_id = get_my_tenant_id()

    )

    AND EXISTS (

      SELECT 1 FROM user_profiles

      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)

    )

  )

  WITH CHECK (

    bucket_id = 'offering-images'

    AND (storage.foldername(name))[1] = get_my_tenant_id()::text

    AND (storage.foldername(name))[3] = 'cover.webp'

    AND EXISTS (

      SELECT 1 FROM offerings o

      WHERE o.id = (storage.foldername(name))[2]::uuid

        AND o.tenant_id = get_my_tenant_id()

    )

    AND EXISTS (

      SELECT 1 FROM user_profiles

      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)

    )

  );



CREATE POLICY "Admins delete offering images"

  ON storage.objects FOR DELETE

  USING (

    bucket_id = 'offering-images'

    AND (storage.foldername(name))[1] = get_my_tenant_id()::text

    AND EXISTS (

      SELECT 1 FROM offerings o

      WHERE o.id = (storage.foldername(name))[2]::uuid

        AND o.tenant_id = get_my_tenant_id()

    )

    AND EXISTS (

      SELECT 1 FROM user_profiles

      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)

    )

  );

```



> **Note:** `offerings_cover_image_path_format` CHECK requires path updates to happen **after** row exists (always true for our flow). On INSERT of a new offering, `cover_image_path` must remain NULL until upload completes.



### B2. Update public RPC



Same migration — **DROP + CREATE** `get_public_offerings_by_subdomain`:



Add to RETURNS TABLE and SELECT:



- `cover_image_path TEXT`

- `updated_at TIMESTAMPTZ` (needed for client cache busting; already on `offerings` table)



Reference: `supabase/migrations/20260602000000_public_offerings_season_start.sql`.



### B3. Regenerate types



```bash

pnpm db:push          # or db:reset-local in dev

pnpm db:types

pnpm email:bundle

```



### B4. Schema updates



**File:** `packages/shared/src/schemas.ts`



Add to `PublicOfferingSchema` and `OfferingSchema`:



```ts

cover_image_path: z.string().nullable().optional(),

updated_at: TimestampSchema.optional(),  // if not already on PublicOfferingSchema

```



**File:** `apps/web/src/features/classes/service.ts`



- **Do NOT** add `cover_image_path` to `ClassInputSchema`

- Add dedicated method:



```ts

static async setCoverImagePath(tenant: Tenant, id: string, path: string | null) {

  // Only field allowed: cover_image_path

  // Validates path matches `${tenant.id}/${id}/cover.webp` when non-null

}

```



### Phase B acceptance criteria



- [ ] Migration applies on fresh reset

- [ ] CHECK constraint rejects malformed paths

- [ ] Storage policies block upload to non-existent offering_id

- [ ] Public RPC returns `cover_image_path` and `updated_at`

- [ ] `cover_image_path` not accepted on generic create/update



---



## Phase C — Upload service + admin form



### C1. Storage helper



**New file:** `apps/web/src/features/classes/lib/offeringImageStorage.ts`



```ts

const BUCKET = 'offering-images';

const CANONICAL_FILENAME = 'cover.webp';

const MAX_INPUT_BYTES = 2 * 1024 * 1024;

const MAX_DECODE_PX = 4096;

const MAX_OUTPUT_PX = 1200;



export function offeringCoverPath(tenantId: string, offeringId: string): string {

  return `${tenantId}/${offeringId}/${CANONICAL_FILENAME}`;

}



export function getOfferingCoverPublicUrl(

  path: string | null | undefined,

  updatedAt?: string | null,

): string | null {

  if (!path) return null;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const base = data.publicUrl;

  if (!updatedAt) return base;

  return `${base}?v=${encodeURIComponent(updatedAt)}`;

}



export async function prepareCoverImageBlob(file: File): Promise<Blob> {

  // 1. Reject if file.size > MAX_INPUT_BYTES

  // 2. Validate magic bytes (JPEG/PNG/WebP) — reject mismatch with file.type

  // 3. Decode via Image(); reject if width or height > MAX_DECODE_PX

  // 4. Draw to canvas; scale so longest edge = min(longest, MAX_OUTPUT_PX)

  // 5. canvas.toBlob('image/webp', 0.85)

}



export async function uploadOfferingCover(

  tenantId: string,

  offeringId: string,

  file: File,

  previousPath?: string | null,

): Promise<string> {

  const path = offeringCoverPath(tenantId, offeringId);

  const blob = await prepareCoverImageBlob(file);

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {

    upsert: true,

    contentType: 'image/webp',

    cacheControl: '3600',

  });

  if (error) throw error;

  // Remove legacy path if different extension from earlier attempts

  if (previousPath && previousPath !== path) {

    await deleteOfferingCover(previousPath).catch(() => undefined);

  }

  return path;

}



export async function deleteOfferingCover(path: string): Promise<void> {

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) throw error;

}

```



**New file:** `apps/web/src/features/classes/lib/offeringImageStorage.test.ts` — unit test `offeringCoverPath`, magic-byte rejection (mock File), dimension rejection (optional integration).



No new npm dependencies.



### C2. ClassForm + submit orchestration



**File:** `apps/web/src/features/classes/components/ClassForm.tsx`



- File input `accept="image/jpeg,image/png,image/webp"`

- Local state: `pendingFile: File | null`, `removeCover: boolean`

- Preview: existing image via `getOfferingCoverPublicUrl(classItem?.cover_image_path, classItem?.updated_at)` or `URL.createObjectURL(pendingFile)`

- Expose pending file + removeCover to parent via submit callback or ref — **preferred signature**:



```ts

onSubmit: (data: Partial<Offering>, imageIntent?: { file: File } | { remove: true }) => Promise<void>

```



**File:** `apps/web/src/features/classes/components/AdminClassesList.tsx` — `handleFormSubmit`:



```

CREATE:

  1. createClass(fields without image) → offering

  2. if imageIntent.file:

       try upload → setCoverImagePath(id, path)

       catch: show error toast; leave class (Q1 default)

  3. close modal



UPDATE:

  1. updateClass(fields without image)

  2. if imageIntent.remove:

       deleteOfferingCover(oldPath) → setCoverImagePath(id, null)

  3. else if imageIntent.file:

       upload → setCoverImagePath(id, path)

       on setCoverImagePath failure: deleteOfferingCover(newPath)  // rollback



REMOVE/REPLACE: always use old cover_image_path from editingClass snapshot

```



### C3. Delete class cleanup



**File:** `apps/web/src/features/classes/service.ts` — `delete()`:



```ts

const offering = await this.get(tenant, id);

if (offering.cover_image_path) {

  try { await deleteOfferingCover(offering.cover_image_path); }

  catch (e) { console.warn('cover image delete failed', e); }

}

await TenantDB.delete(...);

```



### Phase C acceptance criteria



- [ ] Upload produces only `cover.webp` at canonical path

- [ ] Replace shows new image immediately (cache bust via `updated_at`)

- [ ] Remove clears storage + DB path

- [ ] Delete class removes storage object first

- [ ] Generic update API cannot set arbitrary `cover_image_path`

- [ ] Failed path update rolls back new upload

- [ ] Non-admin upload rejected by RLS



---



## Phase D — ClassCard image display



### D1. Layout



**File:** `apps/web/src/components/shared/ClassCard.tsx`



```tsx

const coverUrl = getOfferingCoverPublicUrl(cls.cover_image_path, cls.updated_at);



<div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">

  {coverUrl ? (

    <img src={coverUrl} alt="" className="w-full h-40 object-cover" loading="lazy" />

  ) : (

    <div className="w-full h-40 bg-gray-100" aria-hidden />

  )}

  <div className="p-6">

    {/* h2, time, level, age, price, button — unchanged */}

  </div>

</div>

```



- Decorative image: `alt=""` (class name in `h2`)

- Fixed `h-40` prevents layout shift



### D2. Public data pipeline



**File:** `apps/web/src/features/classes/hooks/useClasses.ts`



In `normalizePublicOffering`:



```ts

cover_image_path: row.cover_image_path ?? null,

updated_at: row.updated_at ?? null,

```



Invalidate `public_classes` query key after image upload (already covered by classes query invalidation — verify public query key).



**File:** `apps/web/src/features/classes/hooks/useClasses.ts` — on mutation success, also invalidate `['public_classes', tenant?.subdomain]`.



### Phase D acceptance criteria



- [ ] Public `/classes` shows uploaded image

- [ ] Placeholder when no image (gray block)

- [ ] Anon users load images

- [ ] Age row + admin/parent button unchanged



---



## i18n additions



| Key | EN | Notes |

|-----|-----|-------|

| `pages.classes.ages_range` | `{{min}}–{{max}}` | ✅ Done |

| `pages.classes.ages_min_only` | `{{min}}+` | ✅ Done |

| `pages.classes.ages_max_only` | `Up to {{max}}` | ✅ Done |

| `form.class.cover_image` | `Cover image` | |

| `form.class.cover_image_hint` | `JPEG, PNG or WebP. Max 2 MB.` | |

| `form.class.remove_cover_image` | `Remove image` | |

| `errors.image_too_large` | `Image must be 2 MB or smaller` | |

| `errors.image_invalid_type` | `Please choose a JPEG, PNG or WebP image` | |

| `errors.image_dimensions` | `Image is too large to process` | |

| `errors.image_upload_failed` | `Class saved, but the image could not be uploaded. Edit the class to try again.` | Q1 default |



---



## File touch list



| File | Phase | Action |

|------|-------|--------|

| `supabase/migrations/20260602100000_offering_cover_images.sql` | B | Create |

| `packages/shared/src/schemas.ts` | B | Add `cover_image_path`, ensure `updated_at` on public schema |

| `packages/shared/src/database.types.ts` | B | Regenerated |

| `apps/web/src/features/classes/service.ts` | B,C | `setCoverImagePath`, delete cleanup; **no** path in ClassInputSchema |

| `apps/web/src/features/classes/hooks/useClasses.ts` | C,D | Normalize fields; invalidate public query |

| `apps/web/src/features/classes/lib/offeringImageStorage.ts` | C | Create |

| `apps/web/src/features/classes/lib/offeringImageStorage.test.ts` | C | Create |

| `apps/web/src/features/classes/components/ClassForm.tsx` | C | Upload UI |

| `apps/web/src/features/classes/components/AdminClassesList.tsx` | A,C | Ages column + submit orchestration |

| `apps/web/src/components/shared/ClassCard.tsx` | D | Image layout |

| `apps/web/src/i18n/en.json` | C | Image keys |

| `apps/web/src/i18n/he.json` | C | Image keys |

| `supabase/functions/_shared/email-dist/*` | B | `pnpm email:bundle` |



---



## Implementation order



```

Phase A3 (admin ages column) ──► can ship immediately (~15 min)

       │

       ▼

Phase B → C → D (images, one PR)

```



---



## Manual test plan



### Age

1. min=5 max=7 → card + table show range

2. min=18 only → `18+`

3. Both null → card omits row; table shows `—`

4. Hebrew locale → translated strings



### Images — happy path

1. Create class with image → public card shows image

2. Replace image → new image visible without hard refresh (`?v=` changes)

3. Remove image → placeholder; DB null

4. Delete class → storage object gone



### Images — security / robustness

1. Attempt `updateClass({ cover_image_path: 'other-tenant/...' })` via devtools → rejected (not in ClassInputSchema / CHECK constraint)

2. Upload as non-admin → RLS 403

3. Upload 3MB file → client error before upload

4. Upload valid file but simulate DB path update failure → storage object rolled back

5. Create class, upload fails → class exists without image; error message shown (Q1)



### Regression

- `pnpm run regtest` passes

- Class create without image works

- Admin View students / parent Enrol buttons unchanged



---



## Optional follow-ups



- Private bucket + signed URLs for non-public classes

- Category default cover image fallback

- Admin table thumbnail column

- Storage orphan sweeper (Edge Function / cron)

- Tenant deletion: delete `{tenant_id}/` prefix in storage

- Move `formatClassAgeRange` to `packages/shared`



---



## Agent execution notes



- SPEC §1.8: additive migration for `cover_image_path` only

- Match `TenantDB`, `ClassService`, i18n en+he patterns

- Run `pnpm run build` after schema changes; `pnpm email:bundle` if shared schemas change

- Do not commit secrets

- ClassCard admin "View students" already shipped — do not regress

- Resolve **Open questions** with defaults if product owner unavailable



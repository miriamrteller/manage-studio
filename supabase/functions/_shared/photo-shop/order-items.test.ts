import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import {
  checkedSmugMugPhotos,
  GalleryNotReadyError,
  listGalleryPhotos,
  MOCK_PHOTO_COUNT,
  mockGalleryPhotos,
  PHOTO_SHOP_BUCKET,
  PREVIEW_URL_SECONDS,
  SMUGMUG_OPEN_TO_CLIENTS,
  uploadedPhotoSource,
} from "./gallery.ts";
import { photoOrderLabel, resolveOrderItems } from "./order-items.ts";

const gallery = mockGalleryPhotos("g");

Deno.test("mock gallery: camera-like names, abstract previews", () => {
  assertEquals(gallery.length, MOCK_PHOTO_COUNT);
  assertEquals(gallery[0], { ...gallery[0], key: "g-0001", fileName: "IMG_0001.jpg" });
  assert(gallery[0].previewUrl.startsWith("data:image/svg+xml"));
  assert(decodeURIComponent(gallery[0].previewUrl).includes("SAMPLE"));
});

Deno.test("SmugMug: a gallery without a passed check stays locked", async () => {
  for (const [shop, code] of [
    [{ provider: "smugmug", gallery_key: "abc" }, "provider_locked"],
    [{ provider: "mock", gallery_key: null }, "no_gallery"],
    [{ provider: "other", gallery_key: "abc" }, "unknown_provider"],
  ] as const) {
    try {
      await listGalleryPhotos(shop);
      throw new Error(`expected ${code}`);
    } catch (e) {
      assert(e instanceof GalleryNotReadyError);
      assertEquals(e.code, code);
    }
  }
  assertEquals((await listGalleryPhotos({ provider: "mock", gallery_key: "g" })).length, MOCK_PHOTO_COUNT);
});

Deno.test("SmugMug: only a gallery with a passed check shows, to the studio and to clients", async () => {
  const photos = [{ key: "K1", fileName: "IMG_1.jpg", previewUrl: "https://photos.smugmug.com/K1-L.jpg" }];
  const checked = {
    provider: "smugmug",
    gallery_key: "abc",
    smugmug_check: { album_key: "abc", passed: true, items: [] },
    smugmug_photos: photos,
    smugmug_checked_at: "2026-11-10T12:00:00Z",
  };
  assertEquals(SMUGMUG_OPEN_TO_CLIENTS, true);
  assertEquals(await listGalleryPhotos(checked, { adminPreview: true }), photos);
  assertEquals(await listGalleryPhotos(checked, { adminPreview: false }), photos);
  const locked = async (shop: typeof checked, adminPreview: boolean) => {
    try {
      await listGalleryPhotos(shop, { adminPreview });
      throw new Error("expected provider_locked");
    } catch (e) {
      assert(e instanceof GalleryNotReadyError);
      assertEquals(e.code, "provider_locked");
    }
  };
  // A check for another gallery, a failed check, or no check: locked for clients and the studio.
  for (const adminPreview of [false, true]) {
    await locked({ ...checked, gallery_key: "other" }, adminPreview);
    await locked({ ...checked, smugmug_check: { album_key: "abc", passed: false, items: [] } }, adminPreview);
    await locked({ ...checked, smugmug_checked_at: null } as unknown as typeof checked, adminPreview);
    await locked({ ...checked, smugmug_photos: [{ key: "K", fileName: "a", previewUrl: "http://x" }] }, adminPreview);
  }
  assertEquals(checkedSmugMugPhotos(checked), photos);
});

Deno.test("uploads: the studio's own previews, keyed by photo id; none yet means no gallery", async () => {
  const photos = [{ key: "p1", fileName: "IMG_0423.jpg", previewUrl: "https://signed/p1" }];
  const seen: string[] = [];
  const source = (key: string) => {
    seen.push(key);
    return Promise.resolve(key === "shoot" ? photos : []);
  };
  assertEquals(await listGalleryPhotos({ provider: "upload", gallery_key: "shoot" }, { uploads: source }), photos);
  assertEquals(seen, ["shoot"]);
  for (const [shop, src, code] of [
    [{ provider: "upload", gallery_key: "empty" }, source, "no_gallery"],
    [{ provider: "upload", gallery_key: null }, source, "no_gallery"],
    [{ provider: "upload", gallery_key: "shoot" }, undefined, "unknown_provider"],
  ] as const) {
    try {
      await listGalleryPhotos(shop, { uploads: src });
      throw new Error(`expected ${code}`);
    } catch (e) {
      assert(e instanceof GalleryNotReadyError);
      assertEquals(e.code, code);
    }
  }
});

Deno.test("uploads source: upload order, signed URLs, files without a URL left out", async () => {
  const rows = [
    { id: "a", file_name: "IMG_1.jpg", storage_path: "t/s/a.jpg" },
    { id: "b", file_name: "IMG_2.jpg", storage_path: "t/s/b.jpg" },
  ];
  let asked: { bucket: string; paths: string[]; ttl: number } | null = null;
  const service = {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_col: string, _v: string) => ({
          order: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[], ttl: number) => {
          asked = { bucket, paths, ttl };
          return Promise.resolve({ data: [{ path: "t/s/a.jpg", signedUrl: "https://signed/a" }], error: null });
        },
      }),
    },
  };
  const photos = await uploadedPhotoSource(service as unknown as SupabaseClient)("s");
  assertEquals(photos, [{ key: "a", fileName: "IMG_1.jpg", previewUrl: "https://signed/a" }]);
  assertEquals(asked, { bucket: PHOTO_SHOP_BUCKET, paths: ["t/s/a.jpg", "t/s/b.jpg"], ttl: PREVIEW_URL_SECONDS });
});

Deno.test("picked photos: in gallery order, file names from the gallery, no duplicates", () => {
  const r = resolveOrderItems(gallery, ["g-0003", "g-0001", "g-0003"], [], false);
  assertEquals(r, {
    ok: true,
    items: [
      { image_key: "g-0001", file_name: "IMG_0001.jpg" },
      { image_key: "g-0003", file_name: "IMG_0003.jpg" },
    ],
  });
});

Deno.test("refuses photos outside the gallery, already taken, or none", () => {
  assertEquals(resolveOrderItems(gallery, ["other-1"], [], false), { ok: false, error: "not_in_gallery" });
  assertEquals(resolveOrderItems(gallery, ["g-0002"], ["g-0002"], false), { ok: false, error: "already_bought" });
  assertEquals(resolveOrderItems(gallery, [], [], false), { ok: false, error: "no_photos" });
  assertEquals(resolveOrderItems(gallery, "g-0001", [], false), { ok: false, error: "no_photos" });
});

Deno.test("all photos: everything not taken yet, whatever was picked", () => {
  const r = resolveOrderItems(gallery, ["nonsense"], ["g-0001", "g-0002"], true);
  assert(r.ok);
  assertEquals(r.items.length, MOCK_PHOTO_COUNT - 2);
  assertEquals(r.items[0].image_key, "g-0003");
  const none = resolveOrderItems(gallery, [], gallery.map((p) => p.key), true);
  assertEquals(none, { ok: false, error: "no_photos" });
});

Deno.test("receipt label in the studio's language", () => {
  assertEquals(photoOrderLabel(3, "en"), "Photos (3)");
  assertEquals(photoOrderLabel(3, "he"), "תמונות (3)");
});

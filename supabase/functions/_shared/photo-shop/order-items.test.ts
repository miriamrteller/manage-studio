import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GalleryNotReadyError, listGalleryPhotos, mockGalleryPhotos, MOCK_PHOTO_COUNT } from "./gallery.ts";
import { photoOrderLabel, resolveOrderItems } from "./order-items.ts";

const gallery = mockGalleryPhotos("g");

Deno.test("mock gallery: camera-like names, abstract previews", () => {
  assertEquals(gallery.length, MOCK_PHOTO_COUNT);
  assertEquals(gallery[0], { ...gallery[0], key: "g-0001", fileName: "IMG_0001.jpg" });
  assert(gallery[0].previewUrl.startsWith("data:image/svg+xml"));
  assert(decodeURIComponent(gallery[0].previewUrl).includes("SAMPLE"));
});

Deno.test("SmugMug stays locked until the live check", async () => {
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

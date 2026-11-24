import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { SmugMugReader } from "./api.ts";
import { SmugMugError } from "./oauth.ts";
import { FORCE_MIN_MS, refreshDue, refreshGalleryLinks, REFRESH_AFTER_MS } from "./refresh.ts";

const NOW = Date.parse("2026-11-22T20:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

Deno.test("refresh is due after a few hours, or at once (not twice a minute) when nothing loaded", () => {
  assertEquals(refreshDue(null, NOW, false), true);
  assertEquals(refreshDue(iso(REFRESH_AFTER_MS - 1000), NOW, false), false);
  assertEquals(refreshDue(iso(REFRESH_AFTER_MS), NOW, false), true);
  assertEquals(refreshDue(iso(FORCE_MIN_MS), NOW, true), true);
  assertEquals(refreshDue(iso(1000), NOW, true), false);
});

/** A fake service client that records the update it is asked for. */
function fakeService() {
  const updates: Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const service = {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq(col: string, v: unknown) {
            filters[col] = v;
            return chain;
          },
          then(resolve: (r: { error: null }) => void) {
            updates.push({ values, filters });
            resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return { service, updates };
}

const saved = [
  { key: "K1", fileName: "IMG_0001.jpg", previewUrl: "https://photos.smugmug.com/old/K1-L.jpg" },
  { key: "K2", fileName: "IMG_0002.jpg", previewUrl: "https://photos.smugmug.com/old/K2-L.jpg" },
];

function readerWith(urls: Record<string, string>): SmugMugReader {
  return {
    get(path: string) {
      if (path === "/api/v2/album/abc") return Promise.resolve({ Album: { Uris: { AlbumImages: "/api/v2/album/abc!images" } } });
      if (path === "/api/v2/album/abc!images") {
        return Promise.resolve({
          AlbumImage: Object.keys(urls).map((k) => ({ ImageKey: k, FileName: `${k}.jpg`, Uris: { ImageSizeDetails: `/api/v2/image/${k}!sizedetails` } })),
        });
      }
      const k = /image\/(\w+)!sizedetails/.exec(path)?.[1];
      if (k && urls[k]) return Promise.resolve({ ImageSizeDetails: { ImageSizeLarge: { Url: urls[k] } } });
      return Promise.reject(new SmugMugError(404, "not found"));
    },
  };
}

const input = {
  tenantId: "t1",
  engagementId: "e1",
  galleryKey: "abc",
  savedPhotos: saved,
  lastRefreshedAt: iso(REFRESH_AFTER_MS + 1000),
  force: false,
};

Deno.test("fresh links replace the saved ones, only for checked photos, and are saved", async () => {
  const { service, updates } = fakeService();
  const reader = readerWith({ K1: "https://photos.smugmug.com/new/K1-L.jpg", K9: "https://photos.smugmug.com/new/K9-L.jpg" });
  const r = await refreshGalleryLinks(service, input, NOW, () => Promise.resolve(reader));
  assertEquals(r.connection, "ok");
  assertEquals(r.photos?.map((p) => p.previewUrl), ["https://photos.smugmug.com/new/K1-L.jpg"]);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].filters, { engagement_id: "e1", tenant_id: "t1", gallery_key: "abc" });
  assertEquals(updates[0].values.smugmug_photos_refreshed_at, new Date(NOW).toISOString());
});

Deno.test("not due: nothing is read from SmugMug", async () => {
  const { service } = fakeService();
  let asked = false;
  const r = await refreshGalleryLinks(service, { ...input, lastRefreshedAt: iso(1000) }, NOW, () => {
    asked = true;
    return Promise.resolve(readerWith({}));
  });
  assertEquals([r.photos, asked], [null, false]);
});

Deno.test("a refused connection keeps the saved links and says the connection is lost", async () => {
  const { service, updates } = fakeService();
  const refused: SmugMugReader = { get: () => Promise.reject(new SmugMugError(401, "refused")) };
  assertEquals(await refreshGalleryLinks(service, input, NOW, () => Promise.resolve(refused)), { photos: null, connection: "lost" });
  assertEquals(await refreshGalleryLinks(service, input, NOW, () => Promise.resolve(null)), { photos: null, connection: "lost" });
  assertEquals(updates.length, 0);
});

Deno.test("SmugMug down or the gallery emptied: the saved links are kept", async () => {
  const { service, updates } = fakeService();
  const down: SmugMugReader = { get: () => Promise.reject(new SmugMugError(0, "unreachable")) };
  assertEquals(await refreshGalleryLinks(service, input, NOW, () => Promise.resolve(down)), { photos: null, connection: "unknown" });
  assertEquals(await refreshGalleryLinks(service, input, NOW, () => Promise.resolve(readerWith({}))), { photos: null, connection: "ok" });
  assertEquals(updates.length, 0);
});

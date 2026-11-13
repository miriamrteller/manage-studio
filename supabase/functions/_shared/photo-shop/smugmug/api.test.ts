import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkAlbumSettings,
  checkGallery,
  linkPath,
  listAlbums,
  type SmugMugReader,
  SmugMugShapeError,
  smugmugPath,
  smugmugReader,
  suggestAlbum,
} from "./api.ts";
import { SmugMugError } from "./oauth.ts";

type Json = Record<string, unknown>;

/** A fake SmugMug: path → Response object. Records every path asked for. */
function fakeReader(routes: Record<string, Json>): SmugMugReader & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    get(path: string) {
      asked.push(path);
      const res = routes[path];
      if (!res) return Promise.reject(new SmugMugError(404, "not found"));
      return Promise.resolve(res);
    },
  };
}

const safeAlbum = {
  AlbumKey: "abc123",
  Name: "Cohen family shoot",
  WebUri: "https://studio.smugmug.com/Cohen-family",
  Watermark: true,
  LargestSize: "Large",
  AllowDownloads: false,
  Uris: { AlbumImages: { Uri: "/api/v2/album/abc123!images" } },
};

function sizes(key: string, extra: Json = {}): Json {
  return {
    ImageSizeDetails: {
      ImageSizeLarge: { Url: `https://photos.smugmug.com/${key}-L.jpg` },
      ...extra,
    },
  };
}

function galleryRoutes(album: Json = safeAlbum, extraSizes: Json = {}): Record<string, Json> {
  return {
    "/api/v2/album/abc123": { Album: album },
    "/api/v2/album/abc123!images": {
      AlbumImage: [
        { ImageKey: "K1", FileName: "IMG_0001.jpg", Uris: { ImageSizeDetails: { Uri: "/api/v2/image/K1!sizedetails" } } },
        { ImageKey: "K2", FileName: "IMG_0002.jpg", Uris: { ImageSizeDetails: { Uri: "/api/v2/image/K2!sizedetails" } } },
        { ImageKey: "V1", FileName: "clip.mp4", IsVideo: true, Uris: { ImageSizeDetails: { Uri: "/api/v2/image/V1!sizedetails" } } },
      ],
      Pages: { NextPage: "/api/v2/album/abc123!images?start=101&count=100" },
    },
    "/api/v2/album/abc123!images?start=101&count=100": {
      AlbumImage: [{ ImageKey: "K3", FileName: "IMG_0003.jpg", Uris: { ImageSizeDetails: { Uri: "/api/v2/image/K3!sizedetails" } } }],
    },
    "/api/v2/image/K1!sizedetails": sizes("K1", extraSizes),
    "/api/v2/image/K2!sizedetails": sizes("K2"),
    "/api/v2/image/K3!sizedetails": sizes("K3"),
  };
}

Deno.test("only api.smugmug.com /api/v2 links are followed", () => {
  assertEquals(smugmugPath("/api/v2/album/x!images"), "/api/v2/album/x!images");
  assertEquals(smugmugPath("https://api.smugmug.com/api/v2/album/x?start=2"), "/api/v2/album/x?start=2");
  assertEquals(smugmugPath("https://evil.example/api/v2/album/x"), null);
  assertEquals(smugmugPath("/services/oauth"), null);
  assertEquals(linkPath({ Uris: { AlbumImages: "/api/v2/a!images" } }, "AlbumImages"), "/api/v2/a!images");
  assertEquals(linkPath({ Uris: {} }, "AlbumImages"), null);
});

Deno.test("albums: follows the signed-in user's UserAlbums link, every page", async () => {
  const reader = fakeReader({
    "/api/v2!authuser": { User: { Uris: { UserAlbums: { Uri: "/api/v2/user/sam!albums" } } } },
    "/api/v2/user/sam!albums": {
      Album: [{ AlbumKey: "a1", Name: "Cohen family", ImageCount: 40 }, { AlbumKey: "bad key!" }],
      Pages: { NextPage: "/api/v2/user/sam!albums?start=101" },
    },
    "/api/v2/user/sam!albums?start=101": { Album: [{ AlbumKey: "a2", Title: "Levi bar mitzvah" }] },
  });
  assertEquals(await listAlbums(reader), [
    { key: "a1", name: "Cohen family", imageCount: 40 },
    { key: "a2", name: "Levi bar mitzvah", imageCount: null },
  ]);
});

Deno.test("albums: no UserAlbums link means we cannot list, not an empty list", async () => {
  const reader = fakeReader({ "/api/v2!authuser": { User: { Uris: { Node: "/api/v2/node/x" } } } });
  const err = await assertRejects(() => listAlbums(reader), SmugMugShapeError);
  assertEquals(err.code, "albums_unavailable");
});

Deno.test("album settings: a missing or unexpected value is never safe", () => {
  const ok = (a: Json) => checkAlbumSettings(a).map((i) => i.ok);
  assertEquals(ok(safeAlbum), [true, true, true]);
  assertEquals(ok({ ...safeAlbum, LargestSize: "XLarge" }), [true, true, true]);
  assertEquals(ok({}), [false, false, false]);
  assertEquals(ok({ Watermark: "true", LargestSize: "Original", AllowDownloads: true }), [false, false, false]);
  assertEquals(ok({ ...safeAlbum, LargestSize: "X3Large" })[1], false);
});

Deno.test("check gallery: passes with watermark, capped size, no downloads, Large loads, nothing bigger does", async () => {
  const reader = fakeReader(galleryRoutes(safeAlbum, { ImageSizeOriginal: { Url: "https://photos.smugmug.com/K1-O.jpg" } }));
  const probed: string[] = [];
  const probe = (url: string) => {
    probed.push(url);
    return Promise.resolve(url.endsWith("-L.jpg"));
  };
  const result = await checkGallery(reader, "abc123", probe);
  assert(result.passed);
  assertEquals(result.albumName, "Cohen family shoot");
  assertEquals(result.webUrl, "https://studio.smugmug.com/Cohen-family", "the gallery's own page (Album.WebUri)");
  assertEquals(result.photos.map((p) => p.key), ["K1", "K2", "K3"]);
  assertEquals(result.photos[0], { key: "K1", fileName: "IMG_0001.jpg", previewUrl: "https://photos.smugmug.com/K1-L.jpg" });
  assertEquals(probed.sort(), [
    "https://photos.smugmug.com/K1-L.jpg",
    "https://photos.smugmug.com/K1-O.jpg",
    "https://photos.smugmug.com/K2-L.jpg",
    "https://photos.smugmug.com/K3-L.jpg",
  ], "every preview is opened, and the first photo's bigger sizes");
  assert(!reader.asked.includes("/api/v2/image/V1!sizedetails"), "videos are skipped");
});

Deno.test("check gallery: an original that loads is a tip only, the gallery still opens", async () => {
  const reader = fakeReader(galleryRoutes(safeAlbum, { ImageSizeOriginal: { Url: "https://photos.smugmug.com/K1-O.jpg" } }));
  const result = await checkGallery(reader, "abc123", () => Promise.resolve(true));
  assert(result.passed);
  assertEquals(result.items.find((i) => i.code === "original_hidden")?.ok, false);
  assertEquals(result.photos.length, 3);
});

Deno.test("check gallery: a preview clients cannot load fails the check", async () => {
  const reader = fakeReader(galleryRoutes());
  const result = await checkGallery(reader, "abc123", () => Promise.resolve(false));
  assert(!result.passed);
  assertEquals(result.items.find((i) => i.code === "preview_public")?.ok, false);
});

Deno.test("check gallery: protection settings are tips only, never block (owner, 11 Nov 2026)", async () => {
  const reader = fakeReader(galleryRoutes({ ...safeAlbum, Watermark: false, LargestSize: "X5Large", AllowDownloads: true }));
  const result = await checkGallery(reader, "abc123", () => Promise.resolve(true));
  assert(result.passed);
  assertEquals(result.photos.length, 3);
  assertEquals(result.items.map((i) => [i.code, i.ok]), [
    ["watermark", false],
    ["largest_size", false],
    ["downloads", false],
    ["photos", true],
    ["preview_public", true],
    ["original_hidden", true],
  ]);
});

Deno.test("check gallery: watermark already in the photos", async () => {
  const reader = fakeReader(galleryRoutes({ ...safeAlbum, Watermark: false, LargestSize: "5K" },
    { ImageSizeOriginal: { Url: "https://photos.smugmug.com/K1-O.jpg" } }));
  const probed: string[] = [];
  const result = await checkGallery(reader, "abc123", (url) => { probed.push(url); return Promise.resolve(true); }, true);
  assert(result.passed);
  assertEquals(result.items.find((i) => i.code === "watermark"), { code: "watermark", ok: true, value: "in_photos" });
  assertEquals(result.items.find((i) => i.code === "largest_size")?.ok, true);
  assertEquals(result.items.find((i) => i.code === "original_hidden"), { code: "original_hidden", ok: true, value: "in_photos" });
  assertEquals(probed.filter((u) => !u.endsWith("-L.jpg")), [], "bigger sizes are not probed");
});

Deno.test("check gallery: a photo with no preview size is left out with a tip, the rest open", async () => {
  const routes = galleryRoutes();
  routes["/api/v2/image/K2!sizedetails"] = { ImageSizeDetails: {} };
  const result = await checkGallery(fakeReader(routes), "abc123", () => Promise.resolve(true));
  assert(result.passed);
  assertEquals(result.photos.map((p) => p.key), ["K1", "K3"]);
  assertEquals(result.items.find((i) => i.code === "some_private"), { code: "some_private", ok: false, value: "1" });
});

Deno.test("check gallery: hidden photos and photos that don't open for visitors are left out", async () => {
  const routes = galleryRoutes();
  const page = routes["/api/v2/album/abc123!images"] as { AlbumImage: Json[] };
  page.AlbumImage[1] = { ...page.AlbumImage[1], Hidden: true };
  const probe = (url: string) => Promise.resolve(!url.includes("K3"));
  const result = await checkGallery(fakeReader(routes), "abc123", probe);
  assert(result.passed);
  assertEquals(result.photos.map((p) => p.key), ["K1"]);
  assertEquals(result.items.find((i) => i.code === "some_private"), { code: "some_private", ok: false, value: "2" });
  assertEquals(result.items.find((i) => i.code === "preview_public")?.ok, true);
});

Deno.test("check gallery: a small photo with no Large size uses its biggest smaller size", async () => {
  const routes = galleryRoutes();
  routes["/api/v2/image/K2!sizedetails"] = {
    ImageSizeDetails: { ImageSizeMedium: { Url: "https://photos.smugmug.com/K2-M.jpg" } },
  };
  const result = await checkGallery(fakeReader(routes), "abc123", () => Promise.resolve(true));
  assert(result.passed);
  assertEquals(result.photos.find((p) => p.key === "K2")?.previewUrl, "https://photos.smugmug.com/K2-M.jpg");
});

Deno.test("check gallery: an empty gallery, or one with only videos, says just that", async () => {
  const probe = () => Promise.reject(new Error("must not probe"));
  const empty = await checkGallery(fakeReader({
    "/api/v2/album/abc123": { Album: safeAlbum },
    "/api/v2/album/abc123!images": { AlbumImage: [] },
  }), "abc123", probe);
  assert(!empty.passed);
  assertEquals(empty.items.find((i) => i.code === "photos"), { code: "photos", ok: false, value: "0", detail: "empty" });
  assertEquals(empty.items.some((i) => i.code === "preview_public" || i.code === "original_hidden"), false);

  const videos = await checkGallery(fakeReader({
    "/api/v2/album/abc123": { Album: safeAlbum },
    "/api/v2/album/abc123!images": {
      AlbumImage: [{ ImageKey: "V1", FileName: "clip.mp4", IsVideo: true, Uris: { ImageSizeDetails: { Uri: "/api/v2/image/V1!sizedetails" } } }],
    },
  }), "abc123", probe);
  assertEquals(videos.items.find((i) => i.code === "photos"), { code: "photos", ok: false, value: "1", detail: "videos_only" });

  const odd = await checkGallery(fakeReader({
    "/api/v2/album/abc123": { Album: safeAlbum },
    "/api/v2/album/abc123!images": { AlbumImage: [{ FileName: "IMG_9.jpg" }] },
  }), "abc123", probe);
  assertEquals(odd.items.find((i) => i.code === "photos"), { code: "photos", ok: false, value: "1", detail: "unreadable" });
});

Deno.test("check gallery: unknown album and bad keys", async () => {
  const err = await assertRejects(() => checkGallery(fakeReader({}), "nope"), SmugMugShapeError);
  assertEquals(err.code, "album_not_found");
  const bad = await assertRejects(() => checkGallery(fakeReader({}), "../x"), SmugMugShapeError);
  assertEquals(bad.code, "album_not_found");
});

Deno.test("reader: signs each call, asks for JSON, refuses other hosts", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string> });
    return Promise.resolve(new Response(JSON.stringify({ Response: { Album: { AlbumKey: "a" } } }), { status: 200 }));
  };
  const reader = smugmugReader({ apiKey: "k", apiSecret: "s" }, { token: "t", secret: "ts" }, { fetch: fetchImpl });
  const res = await reader.get("/api/v2/album/a", { count: "100" });
  assertEquals(res, { Album: { AlbumKey: "a" } });
  assertEquals(calls[0].url, "https://api.smugmug.com/api/v2/album/a?count=100");
  assert(calls[0].headers.Authorization.startsWith("OAuth "));
  assertEquals(calls[0].headers.Accept, "application/json");
  await assertRejects(() => reader.get("https://evil.example/api/v2/x"), SmugMugError);

  const refused = smugmugReader({ apiKey: "k", apiSecret: "s" }, { token: "t", secret: "ts" }, {
    fetch: () => Promise.resolve(new Response("no", { status: 401 })),
  });
  const err = await assertRejects(() => refused.get("/api/v2/album/a"), SmugMugError);
  assertEquals(err.status, 401);
});

Deno.test("suggested gallery: the one named after the client or service", () => {
  const albums = [
    { key: "a1", name: "Levi bar mitzvah", imageCount: 10 },
    { key: "a2", name: "Cohen Family – Park", imageCount: 30 },
  ];
  assertEquals(suggestAlbum(albums, ["Dana Cohen", "Family shoot"]), "a2");
  assertEquals(suggestAlbum(albums, ["Levi", ""]), "a1");
  assertEquals(suggestAlbum(albums, ["Zz", ""]), null);
  assertEquals(suggestAlbum(albums, []), null);
});

Deno.test("check gallery: a gallery page that is not https is not offered", async () => {
  const reader = fakeReader(galleryRoutes({ ...safeAlbum, WebUri: "javascript:alert(1)" }));
  const result = await checkGallery(reader, "abc123", () => Promise.resolve(true));
  assertEquals(result.webUrl, null);
});

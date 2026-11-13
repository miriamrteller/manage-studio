/**
 * Reading a photographer's SmugMug galleries (read-only, signed with the studio's own key
 * and the photographer's access token). Plain TypeScript so tests run without the network.
 *
 * Confirmed from SmugMug's API reference (api.smugmug.com/api/v2/doc/reference/):
 *   - /api/v2!authuser is the signed-in user; /api/v2/album/<key> is one album;
 *   - an Album links to AlbumImages, an Image links to ImageSizeDetails ("raw media URLs
 *     and dimensions for all available sizes"); responses carry these links under Uris.
 * NOT confirmed from official pages (the field names come from the unofficial
 * github.com/bzimmer/smugmug client): UserAlbums, Pages.NextPage, AlbumKey, ImageCount,
 * Watermark / LargestSize / AllowDownloads on an album, ImageSizeLarge / ImageSizeOriginal.
 * So every step follows the links SmugMug sends back instead of building paths, and the
 * gallery check fails closed: a missing or unexpected field means "not safe", never "safe".
 * The live check with a photographer's real key confirms the names.
 */
import { oauthHeader, SmugMugError, type SmugMugKeys, type SmugMugOAuthDeps, type SmugMugToken } from "./oauth.ts";

export const SMUGMUG_API_ORIGIN = "https://api.smugmug.com";
const TIMEOUT_MS = 15_000;
/** Most photos one shoot reads from SmugMug. */
export const MAX_ALBUM_PHOTOS = 1000;
const MAX_ALBUMS = 2000;
const PAGE_SIZE = 100;
/** Image detail calls at a time. */
const CONCURRENCY = 6;

/**
 * Largest display sizes we accept. SmugMug's help: the default watermark is applied to
 * Large and bigger only, and originals are never watermarked
 * (smugmughelp.com/hc/en-us/articles/18212632250644). Clients are shown the Large size.
 */
export const SAFE_LARGEST_SIZES = ["Large", "XLarge"] as const;
/** Check lines that are tips only: they never stop a gallery opening (owner, 11 Nov 2026). */
export const TIP_CODES: readonly string[] = ["watermark", "largest_size", "downloads", "original_hidden"];
/** Sizes that must not be reachable without signing in. */
const UNSAFE_SIZE_KEYS = ["ImageSizeOriginal", "ImageSizeX5Large", "ImageSizeX4Large", "ImageSizeX3Large", "ImageSizeX2Large"];

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** A link SmugMug sent back, as a path on api.smugmug.com. Anything else is refused. */
export function smugmugPath(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri, SMUGMUG_API_ORIGIN);
    if (u.origin !== SMUGMUG_API_ORIGIN || !u.pathname.startsWith("/api/v2")) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/** The path of a named link in an object's Uris (e.g. "AlbumImages"). */
export function linkPath(o: Json | null, name: string): string | null {
  const uris = obj(o?.Uris);
  const link = uris?.[name];
  return smugmugPath(typeof link === "string" ? link : str(obj(link)?.Uri));
}

export interface SmugMugReader {
  /** GET a /api/v2 path as JSON; returns the "Response" object. */
  get(path: string, query?: Record<string, string>): Promise<Json>;
}

export function smugmugReader(keys: SmugMugKeys, token: SmugMugToken, deps: SmugMugOAuthDeps = {}): SmugMugReader {
  const fetchImpl = deps.fetch ?? fetch;
  return {
    async get(path, query = {}) {
      const u = new URL(path, SMUGMUG_API_ORIGIN);
      if (u.origin !== SMUGMUG_API_ORIGIN) throw new SmugMugError(0, "Not a SmugMug address");
      for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
      const url = u.toString();
      const authorization = await oauthHeader("GET", url, keys, token, {}, deps.clock);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetchImpl(url, { method: "GET", headers: { Authorization: authorization, Accept: "application/json" }, signal: controller.signal });
      } catch {
        throw new SmugMugError(0, "SmugMug could not be reached");
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new SmugMugError(res.status, `SmugMug refused the request (${res.status})`);
      }
      const body = obj(await res.json().catch(() => null));
      const response = obj(body?.Response);
      if (!response) throw new SmugMugError(res.status, "SmugMug sent an unexpected answer");
      return response;
    },
  };
}

/** Reads every page of a list, following NextPage links. */
async function readAll(reader: SmugMugReader, path: string, key: string, max: number): Promise<Json[]> {
  const out: Json[] = [];
  let next: string | null = path;
  let first = true;
  while (next && out.length < max) {
    const res: Json = await reader.get(next, first ? { count: String(PAGE_SIZE) } : {});
    first = false;
    const items = res[key];
    if (Array.isArray(items)) for (const it of items) if (obj(it)) out.push(it as Json);
    const nextPath: string | null = smugmugPath(str(obj(res.Pages)?.NextPage));
    next = nextPath && nextPath !== next ? nextPath : null;
  }
  return out.slice(0, max);
}

export interface SmugMugAlbum {
  key: string;
  name: string;
  imageCount: number | null;
}

export class SmugMugShapeError extends Error {
  constructor(public readonly code: "albums_unavailable" | "album_not_found" | "photos_unavailable") {
    super(code);
  }
}

function albumKeyOf(a: Json): string | null {
  const key = str(a.AlbumKey);
  if (key && /^[A-Za-z0-9]+$/.test(key)) return key;
  return null;
}

/** The photographer's galleries, newest SmugMug order kept. */
export async function listAlbums(reader: SmugMugReader): Promise<SmugMugAlbum[]> {
  const authuser = await reader.get("/api/v2!authuser");
  const albumsPath = linkPath(obj(authuser.User), "UserAlbums");
  if (!albumsPath) throw new SmugMugShapeError("albums_unavailable");
  const rows = await readAll(reader, albumsPath, "Album", MAX_ALBUMS);
  const albums: SmugMugAlbum[] = [];
  for (const a of rows) {
    const key = albumKeyOf(a);
    if (!key) continue;
    albums.push({
      key,
      name: (str(a.Name) ?? str(a.Title) ?? key).slice(0, 200),
      imageCount: typeof a.ImageCount === "number" ? a.ImageCount : null,
    });
  }
  return albums;
}

export async function getAlbum(reader: SmugMugReader, albumKey: string): Promise<Json> {
  if (!/^[A-Za-z0-9]+$/.test(albumKey)) throw new SmugMugShapeError("album_not_found");
  try {
    const res = await reader.get(`/api/v2/album/${albumKey}`);
    const album = obj(res.Album);
    if (!album) throw new SmugMugShapeError("album_not_found");
    return album;
  } catch (e) {
    if (e instanceof SmugMugError && e.status === 404) throw new SmugMugShapeError("album_not_found");
    throw e;
  }
}

/** One gallery setting the check looked at. `ok` false keeps the gallery locked. */
export interface GalleryCheckItem {
  code: "watermark" | "largest_size" | "downloads" | "photos" | "preview_public" | "original_hidden";
  ok: boolean;
  /** What SmugMug reported, e.g. "Large" (never a URL). */
  value?: string;
  /** photos only: why none could be read ("empty", "videos_only" or "unreadable"). */
  detail?: "empty" | "videos_only" | "unreadable";
}

export interface SmugMugPhoto {
  key: string;
  fileName: string;
  /** The Large size: watermarked, the one clients see. */
  previewUrl: string;
}

export interface GalleryCheck {
  passed: boolean;
  albumKey: string;
  albumName: string;
  items: GalleryCheckItem[];
  photos: SmugMugPhoto[];
}

/**
 * The album's own Photo Protection settings (tips only, see TIP_CODES).
 * watermarkInPhotos: the photographer's watermark is already in the photo files (owner
 * decision, 11 Nov 2026), so SmugMug's own watermark and size cap aren't needed.
 */
export function checkAlbumSettings(album: Json, watermarkInPhotos = false): GalleryCheckItem[] {
  const largest = str(album.LargestSize);
  return [
    watermarkInPhotos
      ? { code: "watermark", ok: true, value: "in_photos" }
      : { code: "watermark", ok: album.Watermark === true, value: typeof album.Watermark === "boolean" ? String(album.Watermark) : undefined },
    {
      code: "largest_size",
      ok: watermarkInPhotos || (!!largest && (SAFE_LARGEST_SIZES as readonly string[]).includes(largest)),
      value: largest ?? undefined,
    },
    { code: "downloads", ok: album.AllowDownloads === false, value: typeof album.AllowDownloads === "boolean" ? String(album.AllowDownloads) : undefined },
  ];
}

interface ImageWithSizes {
  key: string;
  fileName: string;
  sizes: Json;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface ReadImages {
  images: ImageWithSizes[];
  /** Items SmugMug listed in the gallery, and how many of them were videos. */
  listed: number;
  videos: number;
}

async function readImages(reader: SmugMugReader, album: Json): Promise<ReadImages> {
  const imagesPath = linkPath(album, "AlbumImages");
  if (!imagesPath) throw new SmugMugShapeError("photos_unavailable");
  const rows = await readAll(reader, imagesPath, "AlbumImage", MAX_ALBUM_PHOTOS);
  const videos = rows.filter((r) => r.IsVideo === true).length;
  const usable = rows.filter((r) => r.IsVideo !== true && str(r.ImageKey) && linkPath(r, "ImageSizeDetails"));
  if (usable.length < rows.length - videos) {
    // Shape only (field and link names, never values), so a live mismatch can be read in the logs.
    const first = rows.find((r) => r.IsVideo !== true);
    console.warn("[smugmug] gallery items skipped", JSON.stringify({
      listed: rows.length,
      videos,
      usable: usable.length,
      fields: first ? Object.keys(first).sort() : [],
      links: first ? Object.keys(obj(first.Uris) ?? {}).sort() : [],
    }));
  }
  const images = await mapLimit(usable, CONCURRENCY, async (r) => {
    const res = await reader.get(linkPath(r, "ImageSizeDetails") as string);
    return {
      key: str(r.ImageKey) as string,
      fileName: (str(r.FileName) ?? str(r.Title) ?? (str(r.ImageKey) as string)).slice(0, 255),
      sizes: obj(res.ImageSizeDetails) ?? {},
    };
  });
  return { images, listed: rows.length, videos };
}

function sizeUrl(sizes: Json, key: string): string | null {
  const url = str(obj(sizes[key])?.Url);
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The size clients see: Large, or the biggest smaller size when SmugMug has no Large
 * (it lists only sizes up to the photo's own, so a small photo has no Large).
 */
const PREVIEW_SIZE_KEYS = ["ImageSizeLarge", "ImageSizeMedium", "ImageSizeSmall"];
function previewSizeUrl(sizes: Json): string | null {
  for (const k of PREVIEW_SIZE_KEYS) {
    const url = sizeUrl(sizes, k);
    if (url) return url;
  }
  return null;
}

/** Fetches a URL WITHOUT signing in, as a client's browser would. True when it loads. */
export type PublicProbe = (url: string) => Promise<boolean>;

export const publicProbe: PublicProbe = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal, redirect: "follow" });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * "Check gallery": reads the gallery's photos and its Photo Protection settings. Passes when
 * every photo has a Large size and it loads without signing in (clients must see the
 * previews). Watermark, size cap, downloads and bigger sizes opening are tips only.
 */
export async function checkGallery(
  reader: SmugMugReader,
  albumKey: string,
  probe: PublicProbe = publicProbe,
  watermarkInPhotos = false,
): Promise<GalleryCheck> {
  const album = await getAlbum(reader, albumKey);
  const items = checkAlbumSettings(album, watermarkInPhotos);
  const albumName = (str(album.Name) ?? str(album.Title) ?? albumKey).slice(0, 200);

  // Owner (11 Nov 2026): nothing blocks. The protection settings are tips only
  // (TIP_CODES); a gallery opens once its photos can be read and the Large preview loads.
  const { images, listed, videos } = await readImages(reader, album);
  const photos = images
    .map((im) => ({ key: im.key, fileName: im.fileName, previewUrl: previewSizeUrl(im.sizes) }))
    .filter((p): p is SmugMugPhoto => !!p.previewUrl);
  const allHaveLarge = images.length > 0 && photos.length === images.length;
  if (images.length === 0) {
    // Nothing to sell yet, so the client-side checks below can't run: say only why.
    const detail = listed === 0 ? "empty" : videos === listed ? "videos_only" : "unreadable";
    items.push({ code: "photos", ok: false, value: String(listed), detail });
    return { passed: false, albumKey, albumName, items, photos: [] };
  }
  items.push({ code: "photos", ok: allHaveLarge, value: String(images.length) });

  let previewPublic = false;
  let originalHidden = false;
  if (allHaveLarge) {
    const first = images[0];
    const bigger = UNSAFE_SIZE_KEYS.map((k) => sizeUrl(first.sizes, k)).filter((u): u is string => !!u);
    // The Large size must load for clients. Bigger sizes loading is only a tip.
    previewPublic = await probe(photos[0].previewUrl);
    originalHidden = true;
    // Watermark in the photo files: bigger sizes carry it too, so they may open.
    for (const url of watermarkInPhotos ? [] : bigger) {
      if (await probe(url)) {
        originalHidden = false;
        break;
      }
    }
  }
  items.push({ code: "preview_public", ok: previewPublic });
  items.push({ code: "original_hidden", ok: originalHidden, value: watermarkInPhotos && originalHidden ? "in_photos" : undefined });

  const passed = items.every((i) => i.ok || TIP_CODES.includes(i.code));
  return { passed, albumKey, albumName, items, photos: passed ? photos : [] };
}

/** A gallery name close to the shoot's, for prefilling the picker. */
export function suggestAlbum(albums: SmugMugAlbum[], hints: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = hints.map(norm).filter((h) => h.length >= 3);
  if (words.length === 0) return null;
  let best: { key: string; score: number } | null = null;
  for (const a of albums) {
    const name = norm(a.name);
    let score = 0;
    for (const h of words) {
      if (name === h) score += 3;
      else if (name.includes(h)) score += 2;
      else if (h.split(" ").some((w) => w.length >= 3 && name.includes(w))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { key: a.key, score };
  }
  return best?.key ?? null;
}

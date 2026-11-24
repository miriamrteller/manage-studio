import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { refreshCheckedPhotos, type SmugMugPhoto, smugmugReader, type SmugMugReader } from "./api.ts";
import { getStudioSmugMug } from "./credentials.ts";
import { SmugMugError } from "./oauth.ts";

/**
 * Keeps a checked SmugMug gallery's preview links working. "Check gallery" saves each
 * photo's link once; links saved like that can stop opening later (22 Nov 2026: a studio's
 * shop showed no photos at all). So the shop re-reads the links from SmugMug when the saved
 * ones are older than REFRESH_AFTER_MS, or at once when none of them loaded in the browser
 * (force), at most once per FORCE_MIN_MS.
 */
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
export const FORCE_MIN_MS = 2 * 60 * 1000;

/** "lost": SmugMug refused the studio's connection, or it was never finished. */
export type SmugMugConnection = "ok" | "lost" | "unknown";

export function refreshDue(lastIso: string | null, now: number, force: boolean): boolean {
  const last = lastIso ? Date.parse(lastIso) : NaN;
  if (!Number.isFinite(last)) return true;
  const age = now - last;
  return force ? age >= FORCE_MIN_MS : age >= REFRESH_AFTER_MS;
}

/** The photo keys that passed the check (the only ones a refresh may return). */
export function checkedKeys(saved: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(saved)) return keys;
  for (const p of saved) {
    const key = (p as { key?: unknown } | null)?.key;
    if (typeof key === "string" && key) keys.add(key);
  }
  return keys;
}

export interface RefreshInput {
  tenantId: string;
  engagementId: string;
  galleryKey: string;
  savedPhotos: unknown;
  /** The later of smugmug_checked_at and smugmug_photos_refreshed_at. */
  lastRefreshedAt: string | null;
  force: boolean;
}

export interface RefreshResult {
  /** Fresh links to use, or null to keep the saved ones. */
  photos: SmugMugPhoto[] | null;
  connection: SmugMugConnection;
}

/** Fresh links for the gallery and how the studio's connection looked. Never throws. */
export async function refreshGalleryLinks(
  service: SupabaseClient,
  input: RefreshInput,
  now = Date.now(),
  readerFor: (service: SupabaseClient, tenantId: string) => Promise<SmugMugReader | null> = studioReader,
): Promise<RefreshResult> {
  if (!refreshDue(input.lastRefreshedAt, now, input.force)) return { photos: null, connection: "unknown" };
  const keep = checkedKeys(input.savedPhotos);
  if (keep.size === 0) return { photos: null, connection: "unknown" };
  try {
    const reader = await readerFor(service, input.tenantId);
    if (!reader) return { photos: null, connection: "lost" };
    const photos = await refreshCheckedPhotos(reader, input.galleryKey, keep);
    // Shape only (counts, never links), so a live mismatch can be read in the logs.
    const before = new Map(
      (input.savedPhotos as Array<{ key?: string; previewUrl?: string }>).map((p) => [p?.key, p?.previewUrl]),
    );
    console.log("[smugmug] links refreshed", JSON.stringify({
      saved: keep.size,
      found: photos.length,
      changed: photos.filter((p) => before.get(p.key) !== p.previewUrl).length,
      force: input.force,
    }));
    // Nothing found (gallery emptied or unreadable): keep the saved links rather than wipe them.
    if (photos.length === 0) return { photos: null, connection: "ok" };
    const { error } = await service
      .from("job_photo_shops")
      .update({ smugmug_photos: photos, smugmug_photos_refreshed_at: new Date(now).toISOString() })
      .eq("engagement_id", input.engagementId)
      .eq("tenant_id", input.tenantId)
      .eq("gallery_key", input.galleryKey);
    if (error) console.warn("[smugmug] refreshed links not saved:", error.message);
    return { photos, connection: "ok" };
  } catch (e) {
    if (e instanceof SmugMugError && e.rejected) {
      console.warn("[smugmug] connection refused while refreshing links");
      return { photos: null, connection: "lost" };
    }
    console.warn("[smugmug] links not refreshed:", e instanceof Error ? e.message : "error");
    return { photos: null, connection: "unknown" };
  }
}

async function studioReader(service: SupabaseClient, tenantId: string): Promise<SmugMugReader | null> {
  const studio = await getStudioSmugMug(service, tenantId);
  if (!studio?.token) return null;
  return smugmugReader(studio.keys, studio.token);
}

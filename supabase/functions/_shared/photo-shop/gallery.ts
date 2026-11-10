import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * Photo shop galleries.
 *
 * "upload" (default since 10 Nov 2026): the studio uploads low-res previews,
 * shrunk and watermarked in its own browser before upload; originals never
 * reach OpalSwift. Clients get short-lived signed URLs to those previews.
 *
 * SmugMug is LOCKED until the live check (watermark on, size capped, no
 * original reachable) passes against the real API. Until then only the mock
 * gallery works, so no client ever sees a real photo through OpalSwift.
 */

export interface GalleryPhoto {
  key: string;
  fileName: string;
  /** Watermarked preview the client may see. */
  previewUrl: string;
}

export interface ShopGallery {
  provider: string;
  gallery_key: string | null;
}

export class GalleryNotReadyError extends Error {
  constructor(public readonly code: "no_gallery" | "provider_locked" | "unknown_provider") {
    super(code);
  }
}

/** Photos in a mock gallery: 24, named like camera files. */
export const MOCK_PHOTO_COUNT = 24;

// Abstract shapes only (no people, owner rule), with a "SAMPLE" watermark.
const PALETTE = ["#7c9cbf", "#c9a46b", "#8fb59a", "#b98aa8", "#d0866b", "#6f8fa6"];

function mockPreview(index: number): string {
  const a = PALETTE[index % PALETTE.length];
  const b = PALETTE[(index + 2) % PALETTE.length];
  const cx = 60 + ((index * 37) % 200);
  const cy = 50 + ((index * 53) % 120);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">` +
    `<rect width="320" height="240" fill="${a}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="70" fill="${b}" opacity="0.8"/>` +
    `<rect x="${(index * 29) % 220}" y="150" width="120" height="60" fill="#ffffff" opacity="0.35"/>` +
    `<text x="160" y="130" font-family="sans-serif" font-size="36" fill="#ffffff" opacity="0.6" ` +
    `text-anchor="middle" transform="rotate(-20 160 120)">SAMPLE</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function mockGalleryPhotos(galleryKey: string): GalleryPhoto[] {
  return Array.from({ length: MOCK_PHOTO_COUNT }, (_, i) => {
    const n = String(i + 1).padStart(4, "0");
    return { key: `${galleryKey}-${n}`, fileName: `IMG_${n}.jpg`, previewUrl: mockPreview(i) };
  });
}

/** Lists a shoot's uploaded previews (key = photo id) with signed URLs, in upload order. */
export type UploadedPhotoSource = (galleryKey: string) => Promise<GalleryPhoto[]>;

export const PHOTO_SHOP_BUCKET = "photo-shop-photos";
/** How long a client's preview link works. */
export const PREVIEW_URL_SECONDS = 60 * 60;

/** The real source: job_photo_shop_photos rows + signed URLs (service role). */
export function uploadedPhotoSource(service: SupabaseClient): UploadedPhotoSource {
  return async (galleryKey) => {
    const { data, error } = await service
      .from("job_photo_shop_photos")
      .select("id, file_name, storage_path")
      .eq("engagement_id", galleryKey)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as { id: string; file_name: string; storage_path: string }[];
    if (rows.length === 0) return [];
    const signed = await service.storage.from(PHOTO_SHOP_BUCKET).createSignedUrls(
      rows.map((r) => r.storage_path),
      PREVIEW_URL_SECONDS,
    );
    if (signed.error) throw signed.error;
    const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
    return rows
      .filter((r) => urls.get(r.storage_path))
      .map((r) => ({ key: r.id, fileName: r.file_name, previewUrl: urls.get(r.storage_path) as string }));
  };
}

/** Every photo in the shoot's gallery, in gallery order. */
export async function listGalleryPhotos(shop: ShopGallery, uploads?: UploadedPhotoSource): Promise<GalleryPhoto[]> {
  if (!shop.gallery_key) throw new GalleryNotReadyError("no_gallery");
  switch (shop.provider) {
    case "upload": {
      if (!uploads) throw new GalleryNotReadyError("unknown_provider");
      const photos = await uploads(shop.gallery_key);
      if (photos.length === 0) throw new GalleryNotReadyError("no_gallery");
      return photos;
    }
    case "mock":
      return mockGalleryPhotos(shop.gallery_key);
    case "smugmug":
      // Hard gate: see the file comment. Opened only by the SmugMug PR after the live check.
      throw new GalleryNotReadyError("provider_locked");
    default:
      throw new GalleryNotReadyError("unknown_provider");
  }
}

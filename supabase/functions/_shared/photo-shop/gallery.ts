/**
 * Photo shop galleries. The studio's photos stay with its gallery service;
 * OpalSwift only lists them (key + file name) and shows previews.
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

/** Every photo in the shoot's gallery, in gallery order. */
export function listGalleryPhotos(shop: ShopGallery): Promise<GalleryPhoto[]> {
  if (!shop.gallery_key) return Promise.reject(new GalleryNotReadyError("no_gallery"));
  switch (shop.provider) {
    case "mock":
      return Promise.resolve(mockGalleryPhotos(shop.gallery_key));
    case "smugmug":
      // Hard gate: see the file comment. Opened only by the SmugMug PR after the live check.
      return Promise.reject(new GalleryNotReadyError("provider_locked"));
    default:
      return Promise.reject(new GalleryNotReadyError("unknown_provider"));
  }
}

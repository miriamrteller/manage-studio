/**
 * "Send gallery" on shoots (owner, 18 Nov 2026): which shoots can be sent, and with what.
 * Pure, so the rules are tested in apps/web/src/__tests__/send-shoot-gallery.test.ts.
 */
import { checkedSmugMugPhotos, type ShopGallery } from "./gallery.ts";

export type SendGallerySkip = "not_found" | "cancelled" | "no_email" | "not_checked" | "no_gallery";

export interface SendGalleryShoot {
  cancelled: boolean;
  clientEmail: string | null;
  /** job_details.gallery_url: the link the studio pasted or chose. */
  galleryUrl: string | null;
  /** The shoot's photo shop, if it has one. */
  shop: (ShopGallery & { gallery_web_url?: string | null }) | null;
  /** The photo shop has uploaded photos (provider "upload"). */
  hasUploads: boolean;
  /** The studio has the photo shop feature. */
  shopFeature: boolean;
}

export type SendGalleryPlan =
  | { send: true; galleryUrl: string | null; withShop: boolean }
  | { send: false; reason: SendGallerySkip };

function https(url: string | null | undefined): string | null {
  const value = url?.trim();
  return value && /^https?:\/\//i.test(value) ? value : null;
}

/**
 * A SmugMug gallery goes only once its "Check gallery" has passed; its web address
 * fills the gallery link when none was set. Uploaded photos make the shop the gallery.
 */
export function planGallerySend(shoot: SendGalleryShoot): SendGalleryPlan {
  if (shoot.cancelled) return { send: false, reason: "cancelled" };
  if (!shoot.clientEmail?.trim()) return { send: false, reason: "no_email" };

  const smugmug = shoot.shop?.provider === "smugmug" && Boolean(shoot.shop.gallery_key);
  if (smugmug && !checkedSmugMugPhotos(shoot.shop as ShopGallery)) return { send: false, reason: "not_checked" };

  const shopReady = shoot.shopFeature && (smugmug || (shoot.shop?.provider === "upload" && shoot.hasUploads));
  const galleryUrl = https(shoot.galleryUrl) ?? (smugmug ? https(shoot.shop?.gallery_web_url) : null);
  if (!galleryUrl && !shopReady) return { send: false, reason: "no_gallery" };
  return { send: true, galleryUrl, withShop: shopReady };
}

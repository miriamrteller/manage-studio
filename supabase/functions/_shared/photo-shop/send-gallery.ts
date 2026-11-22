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

/** Longest message the studio can write in the gallery email (the box stops there too). */
export const GALLERY_MESSAGE_MAX = 2000;

/**
 * The studio's own words for the gallery email (owner, 22 Nov 2026). Plain text only:
 * it is HTML-escaped when the email is built. Control characters go, line breaks stay
 * (at most one blank line in a row), and so do
 * bidi override characters that could disguise text. Empty, or the same as the standard wording: null,
 * so the email keeps its standard text.
 */
export function cleanGalleryMessage(raw: unknown, standard: string): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/g, (c) =>
      c === "\t" ? " " : ""
    )
    .split("\n").map((line) => line.trimEnd()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, GALLERY_MESSAGE_MAX)
    .trim();
  if (!text || text === standard.trim()) return null;
  return text;
}

/** Where the studio's gallery email photo is stored (public tenant-assets bucket, its own folder). */
export const GALLERY_PHOTO_FOLDER = "gallery-email";
/** Longest photo description (alt text). */
export const GALLERY_PHOTO_ALT_MAX = 200;

/**
 * The photo the studio added to the gallery email (owner, 22 Nov 2026): only one of
 * this studio's own uploads (a JPEG the app made, in tenant-assets/<tenant>/gallery-email/).
 * Anything else: null, and the email goes without a photo.
 */
export function galleryEmailPhotoUrl(raw: unknown, supabaseUrl: string, tenantId: string): string | null {
  if (typeof raw !== "string" || !supabaseUrl || !tenantId) return null;
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/tenant-assets/${tenantId}/${GALLERY_PHOTO_FOLDER}/`;
  if (!raw.startsWith(prefix)) return null;
  return /^[A-Za-z0-9_-]{1,80}\.jpg$/.test(raw.slice(prefix.length)) ? raw : null;
}

/** The photo's description: one plain line, or the fallback when empty. */
export function cleanPhotoAlt(raw: unknown, fallback: string): string {
  const text = typeof raw === "string"
    ? raw
      // deno-lint-ignore no-control-regex
      .replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, GALLERY_PHOTO_ALT_MAX)
      .trim()
    : "";
  return text || fallback;
}

/** The gallery email's wording this needs (gallery_ready strings, already in the email's language). */
export interface GalleryEmailWording {
  body: string;
  closing: string;
  /** "Sincerely," / "בברכה," */
  sign_off: string;
}

/** Longest name the email can be signed with. */
export const GALLERY_SIGNATURE_MAX = 100;

/** The name the email is signed with: one plain line, or null when empty. */
export function cleanSignature(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GALLERY_SIGNATURE_MAX)
    .trim();
  return text || null;
}

/**
 * Everything the gallery email is built from (Send gallery and the hourly email). The
 * owner's layout (22 Nov 2026): "Dear {name}," then only the body (hers, or the short
 * standard one), the ONE button, then the closing line and "Sincerely, {signature}".
 * The button opens the shop link when there is a shop, never a SmugMug address.
 */
export function galleryEmailVariables(input: {
  recipientName: string;
  galleryUrl: string | null;
  shopUrl: string | null;
  wording: GalleryEmailWording;
  message: string | null;
  photo: { url: string; alt: string } | null;
  /** "Sincerely," and this name under the closing line. */
  signature: string | null;
}): Record<string, string> | null {
  // Never a SmugMug address: without a shop link there is then nothing to send.
  const button = input.shopUrl ?? (isSmugMugLink(input.galleryUrl) ? null : input.galleryUrl);
  if (!button) return null;
  return {
    recipientName: input.recipientName,
    galleryUrl: button,
    ...(input.message ? { customBody: input.message, customBodyReplaces: input.wording.body } : {}),
    ...(input.photo ? { photoUrl: input.photo.url, photoAlt: input.photo.alt, photoAfter: input.wording.body } : {}),
    ...(input.signature
      ? { signOff: input.wording.sign_off, signatureName: input.signature, signatureAfter: input.wording.closing }
      : {}),
  };
}

/** A SmugMug address (owner, 22 Nov 2026: no client email ever links to SmugMug). */
export function isSmugMugLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === "smugmug.com" || host.endsWith(".smugmug.com");
  } catch {
    return false;
  }
}

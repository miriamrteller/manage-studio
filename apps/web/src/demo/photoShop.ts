/**
 * Demo photo shop (feature billing:photo_shop). In real use the photos come
 * from the photographer's SmugMug gallery and OpalSwift only lists them; the
 * demo never calls SmugMug or any other API. Its gallery is a fixed set of
 * small, watermarked previews made from the demo's own photos (no people,
 * see images/CREDITS.md).
 *
 * The rules mirror supabase/migrations/20261104171055_photo_shop.sql:
 * create_job_photo_order (prices worked out here, never from the caller),
 * get_client_photo_shop and deliver_job_photo_order.
 */
import { demoShopPreviews } from './images/manifest';
import type { Row } from './fakeSupabase';

export const PHOTO_SHOP_FEATURE = 'billing:photo_shop';

/** The one demo shoot with a shop: Daniel Avraham's event (the demo client). */
export const SHOP_GALLERY_KEY = 'demo-harbor-hangar-11';
export const SHOP_GALLERY_NAME = 'Demo gallery – in real use these come from your SmugMug';

export interface DemoGalleryPhoto {
  key: string;
  fileName: string;
  previewUrl: string;
}

/** Every photo in a demo gallery, in gallery order (like listGalleryPhotos). */
export function demoGalleryPhotos(galleryKey: string): DemoGalleryPhoto[] {
  return demoShopPreviews.map((previewUrl, i) => {
    const n = String(i + 1).padStart(4, '0');
    return { key: `${galleryKey}-${n}`, fileName: `IMG_${n}.jpg`, previewUrl };
  });
}

export interface ShopTotals {
  usedFree: number;
  paidBefore: number;
}

/** Free photos already taken and money already paid on the shoot (voided items left out). */
export function shopTotals(items: Row[], orders: Row[], engagementId: string): ShopTotals {
  const status = new Map(orders.map((o) => [o.id, o.status]));
  let usedFree = 0;
  let paidBefore = 0;
  for (const i of items) {
    if (i.engagement_id !== engagementId || i.voided_at) continue;
    if (i.included) usedFree++;
    const s = status.get(i.order_id);
    if (s === 'paid' || s === 'delivered') paidBefore += Number(i.price_minor ?? 0);
  }
  return { usedFree, paidBefore };
}

export interface OrderPrice {
  free: number;
  total: number;
  error?: 'no_price' | 'no_all_photos_price';
}

/** create_job_photo_order's maths for `count` photos. */
export function priceOrder(shop: Row, totals: ShopTotals, count: number, allPhotos: boolean): OrderPrice {
  const included = Number(shop.included_photos ?? 0);
  const perPhoto = shop.price_per_photo_minor == null ? null : Number(shop.price_per_photo_minor);
  const allPrice = shop.all_photos_price_minor == null ? null : Number(shop.all_photos_price_minor);
  const free = Math.min(count, Math.max(0, included - totals.usedFree));
  if (allPhotos) {
    if (allPrice == null) return { free, total: 0, error: 'no_all_photos_price' };
    let total = Math.max(0, allPrice - totals.paidBefore);
    if (perPhoto != null) total = Math.min(total, (count - free) * perPhoto);
    if (count === free) total = 0;
    return { free, total };
  }
  if (count > free && perPhoto == null) return { free, total: 0, error: 'no_price' };
  return { free, total: (count - free) * (perPhoto ?? 0) };
}

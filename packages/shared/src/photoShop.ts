/**
 * Photo shop cart maths, shared by the client cart and the Edge Functions.
 * Mirror of create_job_photo_order() in
 * supabase/migrations/20261104171055_photo_shop.sql — the database is the
 * authority; this only shows the client the same total before they pay.
 * Minor units throughout (agorot).
 */

export interface PhotoShopPrices {
  /** Photos the package includes at no cost. */
  includedPhotos: number;
  /** Included photos already used in earlier live orders on this shoot. */
  includedUsed: number;
  /** Price per extra photo; null = the studio has not set one. */
  pricePerPhotoMinor: number | null;
  /** Optional price for every photo in the gallery; null = not offered. */
  allPhotosPriceMinor: number | null;
  /** Money already kept on this shoot (paid or delivered orders, refunds excluded). */
  keptMinor: number;
}

export type PhotoCartProblem = 'no_photos' | 'no_price' | 'no_all_photos_price';

export interface PhotoCartTotal {
  photoCount: number;
  includedCount: number;
  paidCount: number;
  totalMinor: number;
  /** Set when the cart cannot be priced; totalMinor is 0 then. */
  problem: PhotoCartProblem | null;
}

/**
 * Total for `photoCount` new photos. With `allPhotos`, `photoCount` must be
 * every photo in the gallery not bought yet; the total is then the "all photos"
 * price less what was already kept, and never more than one by one.
 */
export function photoCartTotal(prices: PhotoShopPrices, photoCount: number, allPhotos = false): PhotoCartTotal {
  const count = Math.max(0, Math.floor(photoCount));
  const empty = (problem: PhotoCartProblem): PhotoCartTotal => ({
    photoCount: count,
    includedCount: 0,
    paidCount: 0,
    totalMinor: 0,
    problem,
  });
  if (count === 0) return empty('no_photos');

  const includedLeft = Math.max(0, prices.includedPhotos - prices.includedUsed);
  const includedCount = Math.min(count, includedLeft);
  const paidCount = count - includedCount;
  const perPhoto = prices.pricePerPhotoMinor;

  let totalMinor: number;
  if (allPhotos) {
    if (prices.allPhotosPriceMinor == null) return empty('no_all_photos_price');
    totalMinor = Math.max(0, prices.allPhotosPriceMinor - prices.keptMinor);
    if (perPhoto != null) totalMinor = Math.min(totalMinor, paidCount * perPhoto);
    if (paidCount === 0) totalMinor = 0;
  } else {
    if (paidCount > 0 && perPhoto == null) return empty('no_price');
    totalMinor = paidCount * (perPhoto ?? 0);
  }

  return { photoCount: count, includedCount, paidCount, totalMinor, problem: null };
}

/**
 * Whether to offer "all photos" instead of the picked cart: it is offered and
 * cheaper than (or equal to) buying the picked photos one by one.
 */
export function allPhotosIsBetter(
  prices: PhotoShopPrices,
  pickedCount: number,
  remainingCount: number,
): boolean {
  if (prices.allPhotosPriceMinor == null || remainingCount <= pickedCount) return false;
  const picked = photoCartTotal(prices, pickedCount);
  const all = photoCartTotal(prices, remainingCount, true);
  return picked.problem === null && all.problem === null && all.totalMinor <= picked.totalMinor;
}

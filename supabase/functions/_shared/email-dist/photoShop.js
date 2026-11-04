/* @ts-self-types="./photoShop.d.ts" */
/**
 * Photo shop cart maths, shared by the client cart and the Edge Functions.
 * Mirror of create_job_photo_order() in
 * supabase/migrations/20261104171055_photo_shop.sql — the database is the
 * authority; this only shows the client the same total before they pay.
 * Minor units throughout (agorot).
 */
/**
 * Total for `photoCount` new photos. With `allPhotos`, `photoCount` must be
 * every photo in the gallery not bought yet; the total is then the "all photos"
 * price less what was already kept, and never more than one by one.
 */
export function photoCartTotal(prices, photoCount, allPhotos = false) {
    const count = Math.max(0, Math.floor(photoCount));
    const empty = (problem) => ({
        photoCount: count,
        includedCount: 0,
        paidCount: 0,
        totalMinor: 0,
        problem,
    });
    if (count === 0)
        return empty('no_photos');
    const includedLeft = Math.max(0, prices.includedPhotos - prices.includedUsed);
    const includedCount = Math.min(count, includedLeft);
    const paidCount = count - includedCount;
    const perPhoto = prices.pricePerPhotoMinor;
    let totalMinor;
    if (allPhotos) {
        if (prices.allPhotosPriceMinor == null)
            return empty('no_all_photos_price');
        totalMinor = Math.max(0, prices.allPhotosPriceMinor - prices.keptMinor);
        if (perPhoto != null)
            totalMinor = Math.min(totalMinor, paidCount * perPhoto);
        if (paidCount === 0)
            totalMinor = 0;
    }
    else {
        if (paidCount > 0 && perPhoto == null)
            return empty('no_price');
        totalMinor = paidCount * (perPhoto ?? 0);
    }
    return { photoCount: count, includedCount, paidCount, totalMinor, problem: null };
}
/**
 * Whether to offer "all photos" instead of the picked cart: it is offered and
 * cheaper than (or equal to) buying the picked photos one by one.
 */
export function allPhotosIsBetter(prices, pickedCount, remainingCount) {
    if (prices.allPhotosPriceMinor == null || remainingCount <= pickedCount)
        return false;
    const picked = photoCartTotal(prices, pickedCount);
    const all = photoCartTotal(prices, remainingCount, true);
    return picked.problem === null && all.problem === null && all.totalMinor <= picked.totalMinor;
}

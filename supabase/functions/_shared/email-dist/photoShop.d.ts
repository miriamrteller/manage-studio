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
export declare function photoCartTotal(prices: PhotoShopPrices, photoCount: number, allPhotos?: boolean): PhotoCartTotal;
/**
 * Whether to offer "all photos" instead of the picked cart: it is offered and
 * cheaper than (or equal to) buying the picked photos one by one.
 */
export declare function allPhotosIsBetter(prices: PhotoShopPrices, pickedCount: number, remainingCount: number): boolean;
/** A product (print, canvas ...) the studio sells per photo, as the client sees it. */
export interface PhotoProduct {
    id: string;
    name_en: string;
    name_he: string;
    /** e.g. "20x30 cm"; null when the product has no size. */
    size: string | null;
    price_minor: number;
}
export interface PhotoCartGrandTotal {
    digital: PhotoCartTotal;
    productCount: number;
    productsMinor: number;
    totalMinor: number;
    /** Set when the cart cannot be priced. A cart of products only is fine. */
    problem: PhotoCartProblem | null;
}
/**
 * Total for a cart of `digitalCount` digital photos plus product lines (one price per
 * line). Free (package) photos and the "all photos" price apply to digital files only.
 * Mirror of create_job_photo_order() in 20261122204839_photo_shop_print_products.sql.
 */
export declare function photoCartGrandTotal(prices: PhotoShopPrices, digitalCount: number, productPricesMinor: number[], allPhotos?: boolean): PhotoCartGrandTotal;
/** "Canvas print · 20x30 cm" in the client's language. */
export declare function photoProductLabel(p: {
    name_en: string;
    name_he: string;
    size: string | null;
}, language: string): string;
//# sourceMappingURL=photoShop.d.ts.map
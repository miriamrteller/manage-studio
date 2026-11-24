/**
 * Photo shop cart maths. Same cases as supabase/tests/photo-shop (the database
 * is the authority; the client must show the same total before paying).
 * Run: pnpm -C apps/web test photo-shop-pricing.test.ts
 */
import { describe, it, expect } from 'vitest';
import { photoCartTotal, photoCartGrandTotal, photoProductLabel, allPhotosIsBetter, type PhotoShopPrices } from '@shared/photoShop';

const shop = (over: Partial<PhotoShopPrices> = {}): PhotoShopPrices => ({
  includedPhotos: 2,
  includedUsed: 0,
  pricePerPhotoMinor: 3000,
  allPhotosPriceMinor: 10000,
  keptMinor: 0,
  ...over,
});

describe('photoCartTotal', () => {
  it('uses included photos first, then the price per photo', () => {
    expect(photoCartTotal(shop(), 3)).toEqual({
      photoCount: 3, includedCount: 2, paidCount: 1, totalMinor: 3000, problem: null,
    });
    expect(photoCartTotal(shop(), 4).totalMinor).toBe(6000);
  });

  it('counts included photos already used on the shoot', () => {
    expect(photoCartTotal(shop({ includedUsed: 2 }), 2)).toMatchObject({ includedCount: 0, totalMinor: 6000 });
    expect(photoCartTotal(shop({ includedUsed: 5 }), 1)).toMatchObject({ includedCount: 0, totalMinor: 3000 });
  });

  it('is free when everything fits in the package, even with no price set', () => {
    expect(photoCartTotal(shop({ pricePerPhotoMinor: null }), 2)).toMatchObject({ totalMinor: 0, problem: null });
  });

  it('cannot price extras without a price per photo', () => {
    expect(photoCartTotal(shop({ pricePerPhotoMinor: null }), 3)).toMatchObject({ totalMinor: 0, problem: 'no_price' });
  });

  it('with 0 included every photo is paid', () => {
    expect(photoCartTotal(shop({ includedPhotos: 0 }), 3)).toMatchObject({ includedCount: 0, totalMinor: 9000 });
  });

  it('empty cart', () => {
    expect(photoCartTotal(shop(), 0).problem).toBe('no_photos');
  });

  describe('all photos', () => {
    it('is the bundle price less what was already kept', () => {
      expect(photoCartTotal(shop(), 10, true).totalMinor).toBe(10000);
      expect(photoCartTotal(shop({ keptMinor: 6000 }), 10, true).totalMinor).toBe(4000);
      expect(photoCartTotal(shop({ keptMinor: 12000 }), 10, true).totalMinor).toBe(0);
    });

    it('never costs more than one by one', () => {
      expect(photoCartTotal(shop({ includedPhotos: 0 }), 1, true).totalMinor).toBe(3000);
    });

    it('is free when the rest fits in the package', () => {
      expect(photoCartTotal(shop(), 2, true).totalMinor).toBe(0);
    });

    it('needs a bundle price', () => {
      expect(photoCartTotal(shop({ allPhotosPriceMinor: null }), 5, true).problem).toBe('no_all_photos_price');
    });
  });
});

describe('allPhotosIsBetter', () => {
  it('suggests all photos once picking costs as much', () => {
    // 6 picked: 2 free + 4 × 30 = 120 ≥ 100 for all 20.
    expect(allPhotosIsBetter(shop(), 6, 20)).toBe(true);
    // 3 picked: 30 < 100.
    expect(allPhotosIsBetter(shop(), 3, 20)).toBe(false);
  });

  it('not offered without a bundle price, or when everything is already picked', () => {
    expect(allPhotosIsBetter(shop({ allPhotosPriceMinor: null }), 6, 20)).toBe(false);
    expect(allPhotosIsBetter(shop(), 20, 20)).toBe(false);
  });
});

describe('photoCartGrandTotal (prints and other products)', () => {
  it('adds product lines to the digital total; included photos are digital only', () => {
    const r = photoCartGrandTotal(shop(), 3, [14000, 23000]);
    expect(r.digital.totalMinor).toBe(3000);
    expect(r).toMatchObject({ productCount: 2, productsMinor: 37000, totalMinor: 40000, problem: null });
  });

  it('a cart of products only is fine, even with no digital price', () => {
    expect(photoCartGrandTotal(shop({ pricePerPhotoMinor: null }), 0, [14000])).toMatchObject({ totalMinor: 14000, problem: null });
    expect(photoCartGrandTotal(shop(), 0, []).problem).toBe('no_photos');
  });

  it('keeps the digital problem when digital photos cannot be priced', () => {
    const r = photoCartGrandTotal(shop({ includedPhotos: 0, pricePerPhotoMinor: null }), 1, [14000]);
    expect(r).toMatchObject({ problem: 'no_price', totalMinor: 0 });
  });

  it('"all photos" price plus the products', () => {
    expect(photoCartGrandTotal(shop(), 6, [14000], true).totalMinor).toBe(10000 + 14000);
  });

  it('labels in the client language', () => {
    const p = { name_en: 'Canvas print', name_he: 'הדפסה על קנבס', size: '20x30 cm' };
    expect(photoProductLabel(p, 'en')).toBe('Canvas print · 20x30 cm');
    expect(photoProductLabel({ ...p, size: null }, 'he')).toBe('הדפסה על קנבס');
  });
});

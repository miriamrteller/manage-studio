import { supabase } from '@/lib/supabase';

/**
 * Studio shop (beta, flag billing:studio_shop): the items a studio sells to its families,
 * with their sizes and stock. Server side: supabase/migrations/20261110160000_studio_shop.sql.
 * Pictures are of the item only and live in the public shop-product-images bucket.
 */

export const SHOP_IMAGES_BUCKET = 'shop-product-images';
/** Longest edge of an item's picture, in pixels. */
export const SHOP_IMAGE_MAX_EDGE = 1000;

export interface ShopVariant {
  id?: string;
  label: string;
  /** null = not counted (always available); 0 = sold out. */
  stock: number | null;
}

export interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  image_path: string | null;
  active: boolean;
  variants: ShopVariant[];
}

export interface ShopProductInput {
  id?: string;
  name: string;
  description: string | null;
  price_minor: number;
  image_path: string | null;
  active: boolean;
  variants: ShopVariant[];
}

/** Database errors raised as "save_shop_product: <code>" → a stable code for the form. */
export function shopErrorCode(message: string): string {
  const m = /(?:save|delete)_shop_product: (\w+)/.exec(message);
  return m ? m[1] : 'failed';
}

export const StudioShopService = {
  async listProducts(): Promise<ShopProduct[]> {
    const { data, error } = await supabase
      .from('shop_products')
      .select('id, name, description, price_minor, currency, image_path, active, position, variants:shop_product_variants(id, label, stock, position)')
      .order('position', { ascending: true });
    if (error) throw error;
    type Row = ShopProduct & { variants: (ShopVariant & { position: number })[] };
    return ((data ?? []) as unknown as Row[]).map((p) => ({
      ...p,
      variants: [...(p.variants ?? [])]
        .sort((a, b) => a.position - b.position)
        .map(({ id, label, stock }) => ({ id, label, stock })),
    }));
  },

  async saveProduct(input: ShopProductInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_shop_product', {
      p_product: {
        ...(input.id ? { id: input.id } : {}),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        price_minor: input.price_minor,
        image_path: input.image_path,
        active: input.active,
        variants: input.variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), label: v.label.trim(), stock: v.stock })),
      },
    });
    if (error) throw new Error(shopErrorCode(error.message));
    return data as string;
  },

  async deleteProduct(productId: string): Promise<void> {
    const { data, error } = await supabase.rpc('delete_shop_product', { p_product_id: productId });
    if (error) throw new Error(shopErrorCode(error.message));
    if (typeof data === 'string' && data) {
      // The item is gone; a picture left behind is only wasted space.
      await supabase.storage.from(SHOP_IMAGES_BUCKET).remove([data]).catch(() => undefined);
    }
  },

  /** Uploads an item's picture (already shrunk) into the studio's folder; returns its path. */
  async uploadImage(tenantId: string, blob: Blob): Promise<string> {
    const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(SHOP_IMAGES_BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    return path;
  },

  /** Removes a picture no item uses any more (best effort). */
  async removeImage(path: string): Promise<void> {
    await supabase.storage.from(SHOP_IMAGES_BUCKET).remove([path]).catch(() => undefined);
  },

  imageUrl(path: string): string {
    return supabase.storage.from(SHOP_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  },
};

import { supabase } from '@/lib/supabase';

/**
 * Photo shop (beta, flag billing:photo_shop). SmugMug keeps the photos; these
 * rows hold the shoot's gallery choice, prices and what was bought.
 * Server side: supabase/migrations/20261104171055_photo_shop.sql.
 */

export interface JobPhotoShop {
  engagement_id: string;
  provider: 'smugmug' | 'mock';
  gallery_key: string | null;
  gallery_name: string | null;
  included_photos: number;
  price_per_photo_minor: number | null;
  all_photos_price_minor: number | null;
  currency: string;
  closes_at: string;
  /** false = not saved yet; the values are the prefill. */
  saved: boolean;
}

export type JobPhotoShopPatch = Partial<
  Pick<
    JobPhotoShop,
    'gallery_key' | 'gallery_name' | 'included_photos' | 'price_per_photo_minor' | 'all_photos_price_minor' | 'closes_at'
  >
>;

export type PhotoOrderStatus = 'awaiting_payment' | 'paid' | 'delivered' | 'cancelled' | 'refunded';

export interface PhotoOrderItem {
  image_key: string;
  file_name: string;
  included: boolean;
  price_minor: number;
}

export interface PhotoOrder {
  id: string;
  status: PhotoOrderStatus;
  photo_count: number;
  included_count: number;
  total_minor: number;
  currency: string;
  all_photos: boolean;
  delivery_url: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  items: PhotoOrderItem[];
}

export interface StudioPhotoShopDefaults {
  price_per_photo_minor: number | null;
  all_photos_price_minor: number | null;
  gallery_open_days: number;
}

export const DEFAULT_GALLERY_OPEN_DAYS = 90;

export class PhotoShopService {
  static async getShop(engagementId: string): Promise<JobPhotoShop> {
    const { data, error } = await supabase.rpc('get_job_photo_shop', { p_engagement_id: engagementId });
    if (error) throw error;
    return data as unknown as JobPhotoShop;
  }

  static async saveShop(engagementId: string, patch: JobPhotoShopPatch): Promise<JobPhotoShop> {
    const { data, error } = await supabase.rpc('save_job_photo_shop', {
      p_engagement_id: engagementId,
      p_settings: patch as never,
    });
    if (error) throw error;
    return data as unknown as JobPhotoShop;
  }

  /** Orders on the shoot, newest first, with their photos. Cancelled ones are left out. */
  static async listOrders(engagementId: string): Promise<PhotoOrder[]> {
    const { data, error } = await supabase
      .from('job_photo_orders')
      .select(
        'id, status, photo_count, included_count, total_minor, currency, all_photos, delivery_url, created_at, paid_at, delivered_at, items:job_photo_order_items(image_key, file_name, included, price_minor)',
      )
      .eq('engagement_id', engagementId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PhotoOrder[];
  }

  static async deliver(orderId: string, deliveryUrl: string): Promise<void> {
    const { error } = await supabase.rpc('deliver_job_photo_order', {
      p_order_id: orderId,
      p_delivery_url: deliveryUrl.trim(),
    });
    if (error) throw error;
  }

  static async getDefaults(tenantId: string): Promise<StudioPhotoShopDefaults> {
    const { data, error } = await supabase
      .from('tenant_photo_shop_settings')
      .select('price_per_photo_minor, all_photos_price_minor, gallery_open_days')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return data ?? { price_per_photo_minor: null, all_photos_price_minor: null, gallery_open_days: DEFAULT_GALLERY_OPEN_DAYS };
  }

  static async saveDefaults(tenantId: string, values: StudioPhotoShopDefaults): Promise<void> {
    const { error } = await supabase
      .from('tenant_photo_shop_settings')
      .upsert({ tenant_id: tenantId, ...values }, { onConflict: 'tenant_id' });
    if (error) throw error;
  }
}

/** "120.50" → 12050; empty or not a positive number → null. */
export function majorToMinor(value: string): number | null {
  const n = Number(value.replace(',', '.').trim());
  if (!value.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function minorToMajor(value: number | null): string {
  if (value == null) return '';
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

/** https only, like deliver_job_photo_order(). */
export function isDeliveryLink(value: string): boolean {
  return /^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(value.trim());
}

import { supabase } from '@/lib/supabase';

/**
 * Photo shop (beta, flag billing:photo_shop). The studio uploads low-res
 * watermarked previews (made in its own browser, lib/photoPreview.ts); these
 * rows hold the shoot's photos, prices and what was bought.
 * Server side: supabase/migrations/20261104171055_photo_shop.sql and
 * 20261110120000_photo_shop_uploads.sql.
 */

export const PHOTO_SHOP_BUCKET = 'photo-shop-photos';
/** How long the studio's own thumbnail links work. */
const THUMB_URL_SECONDS = 60 * 60;
/** Register uploads in small batches so a long upload keeps what's done. */
const REGISTER_BATCH = 10;

export interface ShopPhoto {
  id: string;
  file_name: string;
  storage_path: string;
  /** Signed link to the preview, for the studio's own screens. */
  url: string | null;
}

export interface JobPhotoShop {
  engagement_id: string;
  tenant_id: string;
  provider: 'smugmug' | 'mock' | 'upload';
  gallery_key: string | null;
  gallery_name: string | null;
  included_photos: number;
  price_per_photo_minor: number | null;
  all_photos_price_minor: number | null;
  currency: string;
  closes_at: string;
  /** Last "Check gallery" for the SmugMug gallery (applies while album_key = gallery_key). */
  smugmug_check?: {
    album_key: string;
    passed: boolean;
    items: { code: string; ok: boolean; value?: string }[];
  } | null;
  /** Photos read at the last passed check (watermarked Large size). */
  smugmug_photos?: { key: string; fileName: string; previewUrl: string }[] | null;
  /** When the SmugMug gallery last passed its check; null = not passed. */
  smugmug_checked_at?: string | null;
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
  /** Sent in by the client to pay in cash; the studio records the cash on the order. */
  pay_by_cash?: boolean;
  job_payment_request_id?: string | null;
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
        'id, status, photo_count, included_count, total_minor, currency, all_photos, delivery_url, created_at, paid_at, delivered_at, pay_by_cash, job_payment_request_id, items:job_photo_order_items(image_key, file_name, included, price_minor)',
      )
      .eq('engagement_id', engagementId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PhotoOrder[];
  }

  /** Saves the download link and emails the client (deliver-photo-order). */
  static async deliver(orderId: string, deliveryUrl: string): Promise<{ emailed: boolean }> {
    const { data, error } = await supabase.functions.invoke('deliver-photo-order', {
      body: { orderId, deliveryUrl: deliveryUrl.trim() },
    });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
      throw new Error(typeof body?.error === 'string' ? body.error : error.message);
    }
    return { emailed: Boolean((data as { emailed?: boolean } | null)?.emailed) };
  }

  /** "Mark as sent": the photos went to the client another way; no link, no email. */
  static async markSent(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_job_photo_order_sent', { p_order_id: orderId });
    if (error) throw new Error(error.message.replace(/^mark_job_photo_order_sent: /, ''));
  }

  /** The shoot's uploaded previews, in upload order, with signed links. */
  static async listPhotos(engagementId: string): Promise<ShopPhoto[]> {
    const { data, error } = await supabase
      .from('job_photo_shop_photos')
      .select('id, file_name, storage_path')
      .eq('engagement_id', engagementId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as Omit<ShopPhoto, 'url'>[];
    if (rows.length === 0) return [];
    const signed = await supabase.storage
      .from(PHOTO_SHOP_BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), THUMB_URL_SECONDS);
    const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
    return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null }));
  }

  /**
   * Uploads ready-made previews (already shrunk and watermarked) to the shoot's
   * folder and registers them. The first upload opens the shop.
   */
  static async uploadPreviews(
    tenantId: string,
    engagementId: string,
    previews: { blob: Blob; fileName: string }[],
    onProgress?: (done: number) => void,
  ): Promise<number> {
    let done = 0;
    let pending: { path: string; file_name: string }[] = [];
    const flush = async () => {
      if (pending.length === 0) return;
      const { error } = await supabase.rpc('add_job_photo_shop_photos', {
        p_engagement_id: engagementId,
        p_photos: pending as never,
      });
      if (error) throw error;
      pending = [];
    };
    for (const p of previews) {
      const path = `${tenantId}/${engagementId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(PHOTO_SHOP_BUCKET)
        .upload(path, p.blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      pending.push({ path, file_name: p.fileName });
      done += 1;
      onProgress?.(done);
      if (pending.length >= REGISTER_BATCH) await flush();
    }
    await flush();
    return done;
  }

  /** Removes a preview (not one a client has bought). */
  static async deletePhoto(photoId: string): Promise<void> {
    const { data, error } = await supabase.rpc('delete_job_photo_shop_photo', { p_photo_id: photoId });
    if (error) throw error;
    if (typeof data === 'string' && data) {
      await supabase.storage.from(PHOTO_SHOP_BUCKET).remove([data]);
    }
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

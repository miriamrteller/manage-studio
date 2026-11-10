import { supabase } from '@/lib/supabase';
import type { PhotoOrderStatus } from './photoShopService';

/** What the client sees of a shoot's photo shop (get_client_photo_shop). No gallery id. */
export interface ClientPhotoShopView {
  engagement_id: string;
  has_shop: boolean;
  open: boolean;
  closes_at: string;
  currency: string;
  included_photos: number;
  included_left: number;
  price_per_photo_minor: number | null;
  all_photos_price_minor: number | null;
  spent_minor: number;
  bought_image_keys: string[];
  awaiting_image_keys: string[];
  orders: ClientPhotoOrder[];
}

export interface ClientPhotoOrder {
  id: string;
  status: PhotoOrderStatus;
  photo_count: number;
  included_count: number;
  total_minor: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  pay_token: string | null;
  delivery_url: string | null;
}

export interface ClientGalleryPhoto {
  key: string;
  fileName: string;
  previewUrl: string;
}

export interface ClientPhotoGallery {
  shop: ClientPhotoShopView;
  photos: ClientGalleryPhoto[];
}

/** The studio's preview of a shoot's shop. sample: the photos are the sample gallery. */
export interface PhotoShopPreview extends ClientPhotoGallery {
  sample: boolean;
}

export interface PlacedPhotoOrder {
  orderId: string;
  status: PhotoOrderStatus;
  totalMinor: number;
  currency: string;
  payToken: string | null;
}

/** The function's error code (e.g. "no_gallery", "already_bought"), or null. */
async function errorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    const body = await ctx.json().catch(() => null);
    if (body && typeof body.error === 'string') return body.error;
  }
  return null;
}

export class ClientPhotoShopError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export class ClientPhotoShopService {
  /** null when the shoot has no shop the client can use yet. */
  static async gallery(engagementId: string): Promise<ClientPhotoGallery | null> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'gallery', engagementId },
    });
    if (error) {
      const code = await errorCode(error);
      if (code && ['no_gallery', 'provider_locked', 'unknown_provider', 'feature_not_available', 'not_found'].includes(code)) {
        return null;
      }
      throw new ClientPhotoShopError(code ?? 'server_error');
    }
    return data as ClientPhotoGallery;
  }

  /** Studio admins: what the shoot's client sees. Throws ClientPhotoShopError("no_shop") when the shoot's shop isn't saved. */
  static async preview(engagementId: string): Promise<PhotoShopPreview> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'preview', engagementId },
    });
    if (error) throw new ClientPhotoShopError((await errorCode(error)) ?? 'server_error');
    return data as PhotoShopPreview;
  }

  static async order(engagementId: string, imageKeys: string[], allPhotos: boolean): Promise<PlacedPhotoOrder> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'order', engagementId, imageKeys, allPhotos },
    });
    if (error) throw new ClientPhotoShopError((await errorCode(error)) ?? 'server_error');
    return data as PlacedPhotoOrder;
  }
}

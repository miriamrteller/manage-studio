import { supabase } from '@/lib/supabase';
import type { PhotoProduct } from '@shared/index';
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
  /** Photos already sent in to be paid in cash: not pickable again. */
  cash_image_keys?: string[];
  /** Prints and other products the studio sells per photo. */
  products?: PhotoProduct[];
  /** The studio takes cards in the photo shop. Off or absent: clients pay the studio directly. */
  card_payments?: boolean;
  /** How to pay the studio directly, as the studio filled it in. Absent: the standard wording. */
  pay_direct?: { ways: PayDirectWay[] } | null;
  orders: ClientPhotoOrder[];
}

export interface ClientPhotoOrder {
  id: string;
  status: PhotoOrderStatus;
  photo_count: number;
  /** Prints and other products in the order. */
  product_count?: number;
  included_count: number;
  total_minor: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  pay_token: string | null;
  delivery_url: string | null;
  /** Sent in to pay the studio in cash (waits for the studio to record it). */
  pay_by_cash?: boolean;
  /** Paid to the studio by Bit or bank transfer: a payment screenshot is asked for. */
  proof_requested?: boolean;
  /** What the client picked on the payment page. */
  pay_method?: PayDirectMethod | null;
  /** When the client sent the payment screenshot (null: not yet). */
  proof_sent_at?: string | null;
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
  /** SmugMug galleries: "lost" when SmugMug refused the studio's connection. */
  smugmugConnection?: 'ok' | 'lost' | 'unknown';
}

export interface PhotoOrderPayment {
  studioName: string;
  order: ClientPhotoOrder;
  pay_direct: ClientPhotoShopView['pay_direct'];
  card_payments: boolean;
}

export interface PlacedPhotoOrder {
  orderId: string;
  status: PhotoOrderStatus;
  totalMinor: number;
  currency: string;
  payToken: string | null;
  payByCash?: boolean;
  /** Paying the studio by Bit / bank transfer: open the order's payment page next. */
  paymentPage?: boolean;
}

/**
 * How the client pays. "cash": the studio directly, any way (no details filled in).
 * "direct": the studio directly by Bit or bank transfer: the order's payment page follows.
 * Every way but card sends the order in now; it waits until the studio records the payment.
 */
export type PhotoPayBy = 'card' | 'cash' | 'direct';

/** A way to pay the studio directly that it switched on (Settings > Payment > Photo shop). */
export type PayDirectMethod = 'bit' | 'bank' | 'cash' | 'cheque';
export interface PayDirectWay {
  method: PayDirectMethod;
  /** Bit: the phone. Bank: the transfer details. Cash / cheque: instructions, or null. */
  details: string | null;
}
/** Bit and bank transfer ask for a payment screenshot; cash and cheque just confirm. */
export const PROOF_METHODS: readonly PayDirectMethod[] = ['bit', 'bank'];

/** Pure: the ways the studio switched on, in order. */
export function payDirectWays(shop: Pick<ClientPhotoShopView, 'pay_direct'>): PayDirectWay[] {
  return (shop.pay_direct?.ways ?? []).filter((w) => w && typeof w.method === 'string');
}

/** Pure: the studio switched on at least one way to pay it directly. */
export function hasPayDirect(shop: Pick<ClientPhotoShopView, 'pay_direct'>): boolean {
  return payDirectWays(shop).length > 0;
}

/** Pure: "a, b or c". */
export function joinWithOr(parts: string[], or: string): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} ${or} ${parts[parts.length - 1]}`;
}

/** The order's payment page in the client's portal (also linked from the emails). */
export function photoOrderPaymentPath(engagementId: string, orderId: string): string {
  return `/dashboard/portal/photo-order/${engagementId}/${orderId}`;
}

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

/** One product (print ...) of one photo in the cart. */
export interface PhotoProductLine {
  imageKey: string;
  productId: string;
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
  /**
   * null when the shoot has no shop the client can use yet.
   * refresh: none of the photos loaded, so ask for fresh links from the gallery.
   */
  /** The order's payment page: the studio's Bit / bank transfer details and the order. */
  static async payment(engagementId: string, orderId: string): Promise<PhotoOrderPayment | null> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'payment', engagementId, orderId },
    });
    if (error) {
      const code = await errorCode(error);
      if (code === 'not_found' || code === 'no_gallery') return null;
      throw new ClientPhotoShopError(code ?? 'server_error');
    }
    return data as PhotoOrderPayment;
  }

  static async gallery(engagementId: string, refresh = false): Promise<ClientPhotoGallery | null> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'gallery', engagementId, ...(refresh ? { refresh: true } : {}) },
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
  static async preview(engagementId: string, refresh = false): Promise<PhotoShopPreview> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'preview', engagementId, ...(refresh ? { refresh: true } : {}) },
    });
    if (error) throw new ClientPhotoShopError((await errorCode(error)) ?? 'server_error');
    return data as PhotoShopPreview;
  }

  /**
   * The client's payment screenshot for a Bit / bank transfer order (images up to 5 MB).
   * Saved on the order and emailed to the studio. Never changes the order.
   */
  /** The way the client picked on the payment page (cash / cheque: no screenshot needed). */
  static async chooseMethod(engagementId: string, orderId: string, method: PayDirectMethod): Promise<void> {
    const { error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'method', engagementId, orderId, method },
    });
    if (error) throw new ClientPhotoShopError((await errorCode(error)) ?? 'server_error');
  }

  static async sendProof(engagementId: string, orderId: string, file: File, method?: PayDirectMethod): Promise<void> {
    if (!PROOF_TYPES.includes(file.type)) throw new ClientPhotoShopError('proof_not_image');
    if (file.size > PROOF_MAX_BYTES) throw new ClientPhotoShopError('proof_too_big');
    const image = await fileToBase64(file);
    const { error } = await supabase.functions.invoke('client-photo-shop', {
      body: { action: 'proof', engagementId, orderId, image, ...(method ? { method } : {}) },
    });
    if (error) throw new ClientPhotoShopError((await errorCode(error)) ?? 'server_error');
  }

  /** payBy "cash" / "bit" / "bank": the order is sent in now and paid to the studio later. */
  static async order(
    engagementId: string,
    imageKeys: string[],
    allPhotos: boolean,
    payBy: PhotoPayBy = 'card',
    products: PhotoProductLine[] = [],
  ): Promise<PlacedPhotoOrder> {
    const { data, error } = await supabase.functions.invoke('client-photo-shop', {
      body: {
        action: 'order',
        engagementId,
        imageKeys,
        allPhotos,
        ...(payBy !== 'card' ? { payBy } : {}),
        ...(products.length > 0 ? { products } : {}),
      },
    });
    if (error) throw new ClientPhotoShopError((await errorCode(error)) ?? 'server_error');
    return data as PlacedPhotoOrder;
  }
}

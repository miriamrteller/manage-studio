import { supabase } from '@/lib/supabase';
import { currentClientLanguage } from '@/lib/clientLanguage';
import { errorBodyFrom } from '@/features/crm/components/InquiryForm';
import type { ClassCouponResult } from '@/features/enrolment/lib/checkoutBootstrapTypes';

/**
 * Studio shop orders (beta, flag billing:studio_shop). Families order in the portal and pay
 * on the usual pay page (/pay/:token) through their child's class enrolment; the studio gets
 * the items ready and the family collects them. Server side:
 * supabase/migrations/20261111150000_studio_shop_orders.sql and functions/studio-shop-order.
 */

export type ShopOrderStatus = 'awaiting_payment' | 'paid' | 'ready' | 'collected' | 'cancelled';

export interface CatalogueVariant {
  id: string;
  label: string;
  /** null = not counted (always available). */
  stock: number | null;
}

export interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  image_path: string | null;
  variants: CatalogueVariant[];
}

/** A size on the public Shop page: in stock or not, never the count. */
export interface PublicCatalogueVariant {
  id: string;
  label: string;
  in_stock: boolean;
}

export interface PublicCatalogueItem extends Omit<CatalogueItem, 'variants'> {
  variants: PublicCatalogueVariant[];
}

export interface ShopOrderLine {
  product_name: string;
  variant_label: string;
  unit_price_minor: number;
  quantity: number;
  image_path: string | null;
}

export interface ShopOrder {
  id: string;
  person_id: string;
  person_name: string;
  ordered_by_name?: string | null;
  status: ShopOrderStatus;
  /** Before discounts; what is paid is total_minor - discount_minor. */
  total_minor: number;
  /** A client discount or coupon on the order's payment. */
  discount_minor?: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  refunded: boolean;
  /** Families only: the pay link token while the order waits for payment. */
  pay_token?: string | null;
  /** Studio only: the buyer pays the studio directly (cash, bank transfer or other). */
  pay_by_cash?: boolean;
  /** Studio only: placed on the public Shop page. */
  guest?: boolean;
  /** Studio only: how to reach the buyer. */
  contact_email?: string | null;
  contact_phone?: string | null;
  /** Studio only: the open payment request, to record a direct payment against. */
  request_id?: string | null;
  lines: ShopOrderLine[];
}

export type GuestPayBy = 'card' | 'studio';

export interface GuestCheckoutInput {
  subdomain: string;
  name: string;
  email: string;
  phone: string;
  lines: CartLine[];
  payBy: GuestPayBy;
  captchaToken: string | null;
  /** Honeypot: always empty for people. */
  website: string;
  elapsedMs: number;
  /** Optional coupon code: comes off the order; a code that doesn't work never stops it. */
  couponCode?: string;
}

export interface GuestCheckoutResult {
  orderId: string | null;
  payToken: string | null;
  /** What is paid, after any discount (null from an older server). */
  totalMinor: number | null;
  coupon: ClassCouponResult | null;
}

export interface CartLine {
  variantId: string;
  quantity: number;
}

/** Database errors raised as "place_shop_order: <code>" (and the others) → a stable code. */
export function shopOrderErrorCode(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  const m = /(?:place_shop_order|cancel_shop_order|set_shop_order_status): (\w+)/.exec(message);
  return m ? m[1] : 'failed';
}

/** The size as families read it: the stored default "One size" is shown in their language. */
export function sizeLabel(label: string, oneSize: string): string {
  return label === 'One size' ? oneSize : label;
}

export const ShopOrdersService = {
  async catalogue(): Promise<CatalogueItem[]> {
    const { data, error } = await supabase.rpc('get_shop_catalogue');
    if (error) throw error;
    return (data ?? []) as unknown as CatalogueItem[];
  },

  /** The public Shop page: anyone, signed in or not. Empty when the studio has no shop. */
  async publicCatalogue(tenantId: string): Promise<PublicCatalogueItem[]> {
    const { data, error } = await supabase.rpc('get_public_shop_catalogue', { p_tenant_id: tenantId });
    if (error) throw error;
    return (data ?? []) as unknown as PublicCatalogueItem[];
  },

  async myOrders(): Promise<ShopOrder[]> {
    const { data, error } = await supabase.rpc('get_my_shop_orders');
    if (error) throw error;
    return (data ?? []) as unknown as ShopOrder[];
  },

  /** Places the order; returns the pay link token. */
  async placeOrder(lines: CartLine[], personId: string | null): Promise<{ orderId: string; payToken: string | null }> {
    const { data, error } = await supabase.rpc('place_shop_order', {
      p_lines: lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
      ...(personId ? { p_person_id: personId } : {}),
    });
    if (error) throw new Error(`place_shop_order: ${shopOrderErrorCode(error)}`);
    const r = data as { order_id: string; pay_token: string | null };
    return { orderId: r.order_id, payToken: r.pay_token };
  },

  /**
   * The public Shop page's checkout (anyone). Card: returns the pay link token. Paying the
   * studio directly: the order is sent in. Errors come back as "place_shop_order: <code>".
   */
  /** The public Shop page offers a coupon box only when the studio has a code. Never an error. */
  async studioOffersCoupons(tenantId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('studio_offers_coupons', { p_tenant_id: tenantId });
    return !error && data === true;
  },

  async guestCheckout(input: GuestCheckoutInput): Promise<GuestCheckoutResult> {
    const { data, error } = await supabase.functions.invoke('studio-shop-checkout', {
      body: {
        subdomain: input.subdomain,
        name: input.name.trim(),
        email: input.email.trim(),
        phone: input.phone.trim() || null,
        lines: input.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
        payBy: input.payBy,
        captchaToken: input.captchaToken,
        website: input.website,
        elapsedMs: input.elapsedMs,
        couponCode: input.couponCode?.trim() || null,
        clientLanguage: currentClientLanguage(),
      },
    });
    const body = (data ?? {}) as {
      ok?: boolean;
      orderId?: string | null;
      payToken?: string | null;
      totalMinor?: number;
      coupon?: ClassCouponResult;
      error?: string;
    };
    if (error || !body.ok) {
      const errBody = (await errorBodyFrom(error, data)) as { error?: unknown } | null;
      const code = typeof errBody?.error === 'string' && /^\w+$/.test(errBody.error) ? errBody.error : 'failed';
      throw new Error(`place_shop_order: ${code}`);
    }
    return {
      orderId: body.orderId ?? null,
      payToken: body.payToken ?? null,
      totalMinor: typeof body.totalMinor === 'number' ? body.totalMinor : null,
      coupon: body.coupon ?? null,
    };
  },

  async cancelOrder(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_shop_order', { p_order_id: orderId });
    if (error) throw new Error(`cancel_shop_order: ${shopOrderErrorCode(error)}`);
  },

  async studioOrders(): Promise<ShopOrder[]> {
    const { data, error } = await supabase.rpc('get_studio_shop_orders');
    if (error) throw error;
    return (data ?? []) as unknown as ShopOrder[];
  },

  /** Studio: "Ready to collect" (emails the family) or "Collected". */
  async setStatus(orderId: string, status: 'ready' | 'collected'): Promise<{ emailed: boolean }> {
    const { data, error } = await supabase.functions.invoke('studio-shop-order', { body: { orderId, status } });
    if (error) throw error;
    const r = (data ?? {}) as { error?: string; emailed?: boolean };
    if (r.error) throw new Error(`set_shop_order_status: ${r.error}`);
    return { emailed: r.emailed === true };
  },
};

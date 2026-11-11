import { supabase } from '@/lib/supabase';

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
  total_minor: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  refunded: boolean;
  /** Families only: the pay link token while the order waits for payment. */
  pay_token?: string | null;
  lines: ShopOrderLine[];
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

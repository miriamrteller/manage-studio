/**
 * Demo handlers for the photo shop (see photoShop.ts for the rules and the
 * gallery). Real counterparts:
 *   rpc get_job_photo_shop / save_job_photo_shop   (admin, shoot page)
 *   fn  client-photo-shop { gallery | order }       (client portal)
 *   fn  deliver-photo-order                         (admin, paste a download link)
 * plus the job_photo_orders_follow_request trigger (an order follows its payment).
 */
import {
  DemoRpcError,
  type DemoContext,
  type FunctionHandler,
  type Row,
  type RpcHandler,
} from './fakeSupabase';
import { sendToOutbox } from './outbox';
import { PHOTO_SHOP_FEATURE, demoGalleryPhotos, priceOrder, shopTotals } from './photoShop';

const DEFAULT_OPEN_DAYS = 90;

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

function isAdmin(ctx: DemoContext): boolean {
  const p = rows(ctx, 'user_profiles').find((u) => u.id === ctx.user?.id);
  return Array.isArray(p?.role) && (p.role as string[]).includes('tenant_admin');
}

/** The signed-in client's person, or null (admins have none). */
function myPersonId(ctx: DemoContext): string | null {
  const p = rows(ctx, 'user_profiles').find((u) => u.id === ctx.user?.id);
  return (p?.person_id as string | null) ?? null;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function engagementOf(ctx: DemoContext, engagementId: unknown): Row {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  if (!eng) throw new DemoRpcError('job not found');
  return eng;
}

function shopRow(ctx: DemoContext, engagementId: unknown): Row | undefined {
  return rows(ctx, 'job_photo_shops').find((s) => s.engagement_id === engagementId);
}

/** photo_shop_prefill: package photos, studio defaults, open for N days. */
function prefill(ctx: DemoContext, eng: Row): Row {
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng.offering_id);
  const settings = rows(ctx, 'tenant_photo_shop_settings').find((s) => s.tenant_id === eng.tenant_id);
  const days = Number(settings?.gallery_open_days ?? DEFAULT_OPEN_DAYS);
  return {
    engagement_id: eng.id,
    tenant_id: eng.tenant_id,
    provider: 'smugmug',
    gallery_key: null,
    gallery_name: null,
    included_photos: Number(offering?.photos_included ?? 0),
    price_per_photo_minor: settings?.price_per_photo_minor ?? null,
    all_photos_price_minor: settings?.all_photos_price_minor ?? null,
    currency: 'ILS',
    closes_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    saved: false,
  };
}

function adminShop(ctx: DemoContext, engagementId: unknown, fn: string): Row {
  const eng = engagementOf(ctx, engagementId);
  if (!isAdmin(ctx)) throw new DemoRpcError(`${fn}: access denied`, '42501');
  const shop = shopRow(ctx, engagementId);
  return shop ? { ...shop, saved: true } : prefill(ctx, eng);
}

/** The studio has the feature and hasn't switched it off. */
function shopFeatureOn(ctx: DemoContext): boolean {
  const tenant = rows(ctx, 'tenants')[0];
  const off = new Set((tenant?.feature_optouts as string[] | undefined) ?? []);
  return ((tenant?.enabled_features as string[] | undefined) ?? []).includes(PHOTO_SHOP_FEATURE) && !off.has(PHOTO_SHOP_FEATURE);
}

/** get_client_photo_shop: what the client may see of the shop (no gallery id). */
function clientView(ctx: DemoContext, engagementId: string): Row {
  const shop = shopRow(ctx, engagementId);
  if (!shop) return { engagement_id: engagementId, has_shop: false };
  const orders = rows(ctx, 'job_photo_orders').filter((o) => o.engagement_id === engagementId);
  const items = rows(ctx, 'job_photo_order_items').filter((i) => i.engagement_id === engagementId && !i.voided_at);
  const status = new Map(orders.map((o) => [o.id, o.status]));
  const { usedFree, paidBefore } = shopTotals(items, orders, engagementId);
  const keysWhere = (ok: (s: unknown) => boolean) =>
    items.filter((i) => ok(status.get(i.order_id))).map((i) => String(i.image_key));
  const requests = rows(ctx, 'job_payment_requests');
  return {
    engagement_id: engagementId,
    has_shop: shop.gallery_key != null,
    open: shop.gallery_key != null && new Date(String(shop.closes_at)) > new Date(),
    closes_at: shop.closes_at,
    currency: shop.currency,
    included_photos: shop.included_photos,
    included_left: Math.max(0, Number(shop.included_photos) - usedFree),
    price_per_photo_minor: shop.price_per_photo_minor,
    all_photos_price_minor: shop.all_photos_price_minor,
    spent_minor: paidBefore,
    bought_image_keys: keysWhere((s) => s === 'paid' || s === 'delivered' || s === 'refunded'),
    awaiting_image_keys: keysWhere((s) => s === 'awaiting_payment'),
    orders: orders
      .filter((o) => o.status !== 'cancelled')
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((o) => ({
        id: o.id,
        status: o.status,
        photo_count: o.photo_count,
        included_count: o.included_count,
        total_minor: o.total_minor,
        currency: o.currency,
        created_at: o.created_at,
        paid_at: o.paid_at,
        delivered_at: o.delivered_at,
        pay_token:
          o.status === 'awaiting_payment'
            ? (requests.find((r) => r.id === o.job_payment_request_id)?.public_token ?? null)
            : null,
        delivery_url: o.status === 'delivered' || o.status === 'refunded' ? o.delivery_url : null,
      })),
  };
}

/** Earlier unpaid orders by this person on the shoot: cancelled, their photos freed (the cart replaces them). */
function cancelOwnAwaiting(ctx: DemoContext, engagementId: string, personId: string) {
  for (const o of rows(ctx, 'job_photo_orders')) {
    if (o.engagement_id !== engagementId || o.person_id !== personId || o.status !== 'awaiting_payment') continue;
    const req = rows(ctx, 'job_payment_requests').find((r) => r.id === o.job_payment_request_id);
    if (req && (req.status === 'pending' || req.status === 'sent')) req.status = 'cancelled';
    Object.assign(o, { status: 'cancelled', cancelled_at: ctx.now() });
    for (const i of rows(ctx, 'job_photo_order_items')) {
      if (i.order_id === o.id && !i.voided_at) i.voided_at = ctx.now();
    }
  }
}

function placeOrder(ctx: DemoContext, engagementId: string, body: Row): Row {
  const view = clientView(ctx, engagementId);
  if (!view.open) throw new DemoRpcError('shop_closed');
  const personId = myPersonId(ctx);
  const eng = engagementOf(ctx, engagementId);
  if (!personId || eng.person_id !== personId) throw new DemoRpcError('not_this_client');
  const shop = shopRow(ctx, engagementId) as Row;
  const gallery = demoGalleryPhotos(String(shop.gallery_key));

  // resolveOrderItems: only gallery photos, none already bought or awaiting someone else's payment.
  const mine = new Set(
    rows(ctx, 'job_photo_order_items')
      .filter((i) => i.engagement_id === engagementId && !i.voided_at)
      .filter((i) => {
        const o = rows(ctx, 'job_photo_orders').find((x) => x.id === i.order_id);
        return o?.person_id === personId && o?.status === 'awaiting_payment';
      })
      .map((i) => String(i.image_key)),
  );
  const taken = new Set(
    [...(view.bought_image_keys as string[]), ...(view.awaiting_image_keys as string[])].filter((k) => !mine.has(k)),
  );
  const allPhotos = body.allPhotos === true;
  let keys: string[];
  if (allPhotos) {
    keys = gallery.map((p) => p.key).filter((k) => !taken.has(k));
  } else {
    if (!Array.isArray(body.imageKeys)) throw new DemoRpcError('no_photos');
    keys = [...new Set((body.imageKeys as unknown[]).filter((k): k is string => typeof k === 'string'))];
    if (keys.some((k) => !gallery.some((p) => p.key === k))) throw new DemoRpcError('not_in_gallery');
    if (keys.some((k) => taken.has(k))) throw new DemoRpcError('already_bought');
  }
  if (keys.length === 0) throw new DemoRpcError('no_photos');
  const items = gallery.filter((p) => keys.includes(p.key));

  // create_job_photo_order
  cancelOwnAwaiting(ctx, engagementId, personId);
  const orders = rows(ctx, 'job_photo_orders');
  const totals = shopTotals(rows(ctx, 'job_photo_order_items'), orders, engagementId);
  const price = priceOrder(shop, totals, items.length, allPhotos);
  if (price.error) throw new DemoRpcError(price.error);

  const orderId = ctx.uuid();
  let request: Row | null = null;
  if (price.total > 0) {
    const tenant = rows(ctx, 'tenants')[0];
    request = {
      id: ctx.uuid(),
      tenant_id: shop.tenant_id,
      engagement_id: engagementId,
      label: tenant?.language_default === 'en' ? `Photos (${items.length})` : `תמונות (${items.length})`,
      amount_minor: price.total,
      currency: shop.currency,
      due_date: null,
      status: 'pending',
      sent_at: null,
      paid_at: null,
      max_installments: 1,
      public_token: randomHex(24),
      created_at: ctx.now(),
      updated_at: ctx.now(),
    };
    rows(ctx, 'job_payment_requests').push(request);
  }
  const paid = price.total === 0;
  orders.push({
    id: orderId,
    tenant_id: shop.tenant_id,
    engagement_id: engagementId,
    person_id: personId,
    status: paid ? 'paid' : 'awaiting_payment',
    all_photos: allPhotos,
    photo_count: items.length,
    included_count: price.free,
    total_minor: price.total,
    currency: shop.currency,
    job_payment_request_id: request?.id ?? null,
    delivery_url: null,
    created_at: ctx.now(),
    paid_at: paid ? ctx.now() : null,
    delivered_at: null,
  });
  const charged = items.length - price.free;
  items.forEach((p, n) => {
    const included = n < price.free;
    let priceMinor = included || allPhotos ? 0 : Number(shop.price_per_photo_minor);
    if (allPhotos && !included && price.total > 0) {
      // The all-photos price spread over the paid photos; the remainder on the first.
      priceMinor = Math.floor(price.total / charged) + (n === price.free ? price.total % charged : 0);
    }
    rows(ctx, 'job_photo_order_items').push({
      id: ctx.uuid(),
      order_id: orderId,
      job_photo_order_id: orderId,
      tenant_id: shop.tenant_id,
      engagement_id: engagementId,
      image_key: p.key,
      file_name: p.fileName,
      included,
      price_minor: priceMinor,
      voided_at: null,
      created_at: ctx.now(),
    });
  });
  if (paid) notifyStudio(ctx, orderId);
  return {
    orderId,
    status: paid ? 'paid' : 'awaiting_payment',
    totalMinor: price.total,
    currency: shop.currency,
    payToken: request?.public_token ?? null,
  };
}

/** The studio hears about a new paid order (notifyStudioPhotoOrderPaid). */
function notifyStudio(ctx: DemoContext, orderId: string) {
  const order = rows(ctx, 'job_photo_orders').find((o) => o.id === orderId);
  const person = rows(ctx, 'people').find((p) => p.id === order?.person_id);
  const tenant = rows(ctx, 'tenants')[0];
  sendToOutbox({
    to: String(tenant?.contact_email ?? 'studio'),
    subject: `New photo order: ${String(person?.name ?? 'a client')} (${String(order?.photo_count ?? 0)})`,
    body: 'The photos are paid for. Paste a download link on the shoot page to send them.',
    link: { label: 'Open the shoot', href: '#/admin/jobs' },
  });
}

/** job_photo_orders_follow_request: a paid request marks its photo order paid. */
export function photoOrderFollowsPayment(ctx: DemoContext, request: Row) {
  const order = rows(ctx, 'job_photo_orders').find((o) => o.job_payment_request_id === request.id);
  if (!order || order.status !== 'awaiting_payment') return;
  Object.assign(order, { status: 'paid', paid_at: request.paid_at ?? ctx.now() });
  notifyStudio(ctx, String(order.id));
}

export const photoShopRpcs: Record<string, RpcHandler> = {
  get_job_photo_shop: (args, ctx) => adminShop(ctx, args.p_engagement_id, 'get_job_photo_shop'),

  save_job_photo_shop: (args, ctx) => {
    const current = adminShop(ctx, args.p_engagement_id, 'save_job_photo_shop');
    const patch = args.p_settings;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new DemoRpcError('save_job_photo_shop: settings must be an object');
    }
    const editable = ['provider', 'gallery_key', 'gallery_name', 'included_photos', 'price_per_photo_minor', 'all_photos_price_minor', 'closes_at'];
    const next: Row = { ...current };
    for (const k of editable) if (k in (patch as Row)) next[k] = (patch as Row)[k];
    delete next.saved;
    next.included_photos = Number(next.included_photos ?? 0);
    next.updated_at = ctx.now();
    const list = rows(ctx, 'job_photo_shops');
    const existing = list.find((s) => s.engagement_id === args.p_engagement_id);
    if (existing) Object.assign(existing, next);
    else list.push({ ...next, created_at: ctx.now() });
    return adminShop(ctx, args.p_engagement_id, 'save_job_photo_shop');
  },
};

export const photoShopFunctions: Record<string, FunctionHandler> = {
  'client-photo-shop': (body, ctx) => {
    if (!ctx.user) throw new DemoRpcError('Missing authorization');
    const engagementId = typeof body.engagementId === 'string' ? body.engagementId : '';
    if (!engagementId || (body.action !== 'gallery' && body.action !== 'order')) throw new DemoRpcError('bad_request');
    const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
    const ownShoot = eng && myPersonId(ctx) != null && eng.person_id === myPersonId(ctx);
    if (!eng || !(ownShoot || isAdmin(ctx))) throw new DemoRpcError('not_found');
    const view = clientView(ctx, engagementId);
    const shop = shopRow(ctx, engagementId);
    if (!shop || !view.has_shop) throw new DemoRpcError('no_gallery');
    if (!shopFeatureOn(ctx)) throw new DemoRpcError('feature_not_available');
    // Demo galleries only: the real SmugMug provider is never called here.
    if (shop.provider !== 'mock') throw new DemoRpcError('provider_locked');
    if (body.action === 'gallery') return { shop: view, photos: demoGalleryPhotos(String(shop.gallery_key)) };
    return placeOrder(ctx, engagementId, body);
  },

  'deliver-photo-order': (body, ctx) => {
    if (!ctx.user) throw new DemoRpcError('Missing authorization');
    const url = String(body.deliveryUrl ?? '').trim();
    if (!body.orderId || !url) throw new DemoRpcError('bad_request');
    const order = rows(ctx, 'job_photo_orders').find((o) => o.id === body.orderId);
    if (!order) throw new DemoRpcError('order not found');
    if (!isAdmin(ctx)) throw new DemoRpcError('access denied');
    if (order.status !== 'paid' && order.status !== 'delivered') throw new DemoRpcError(`order is ${String(order.status)}`);
    if (!/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(url) || url.length > 2000) {
      throw new DemoRpcError('link must be an https web address');
    }
    Object.assign(order, { status: 'delivered', delivery_url: url, delivered_at: ctx.now() });
    const person = rows(ctx, 'people').find((p) => p.id === order.person_id);
    if (!person?.email) return { delivered: true, emailed: false };
    sendToOutbox({
      to: String(person.email),
      subject: 'Your photos are ready to download',
      body: `Hi ${String(person.name ?? '')}, your ${String(order.photo_count)} photos are ready. The link is also in your portal under the shoot.`,
      link: { label: 'Open my shoots', href: '#/portal' },
    });
    return { delivered: true, emailed: true };
  },
};

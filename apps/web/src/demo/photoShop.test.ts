import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient, type Row } from './fakeSupabase';
import { baseFunctions } from './functions';
import { baseRpcs } from './rpcs';
import { extraFunctions, extraRpcs, hooks, views } from './extensions';
import { photoShopFunctions, photoShopRpcs } from './photoShopHandlers';
import { SHOP_GALLERY_KEY } from './photoShop';
import { ADMIN_EMAIL, ADMIN_USER_ID, CLIENT_USER_ID, DEMO_CLIENT, buildSeed, engagementId } from './seed';

const SHOOT = engagementId(8);

function client(who: 'admin' | 'client' | 'none' = 'client') {
  const c = new FakeSupabaseClient({
    tables: buildSeed(),
    rpcs: { ...baseRpcs, ...extraRpcs, ...photoShopRpcs },
    functions: { ...baseFunctions, ...extraFunctions, ...photoShopFunctions },
    hooks,
    views,
  });
  if (who === 'admin') c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  if (who === 'client') c.setUser({ id: CLIENT_USER_ID, email: DEMO_CLIENT.email });
  return c;
}

const gallery = async (c: FakeSupabaseClient, id = SHOOT) =>
  c.functions.invoke('client-photo-shop', { body: { action: 'gallery', engagementId: id } });
const order = async (c: FakeSupabaseClient, imageKeys: string[], allPhotos = false) =>
  c.functions.invoke('client-photo-shop', { body: { action: 'order', engagementId: SHOOT, imageKeys, allPhotos } });
const errorCode = async (e: unknown) => ((await (e as { context: Response }).context.json()) as { error: string }).error;
const key = (n: number) => `${SHOP_GALLERY_KEY}-${String(n).padStart(4, '0')}`;

describe('demo photo shop', () => {
  it('the photographer studio has the feature; the admin sees the saved shop with the SmugMug note', async () => {
    const c = client('admin');
    expect((await c.rpc('get_tenant_features', {})).data).toContain('billing:photo_shop');
    const shop = (await c.rpc('get_job_photo_shop', { p_engagement_id: SHOOT })).data as Row;
    expect(shop).toMatchObject({ saved: true, provider: 'mock', included_photos: 3, price_per_photo_minor: 2500 });
    expect(String(shop.gallery_name)).toMatch(/SmugMug/);
    const orders = (await c.from('job_photo_orders').select('id, status, items:job_photo_order_items(image_key, included)').eq('engagement_id', SHOOT)).data as Row[];
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('delivered');
    expect((orders[0].items as Row[]).length).toBe(5);
  });

  it('a shoot without a shop is prefilled from the studio defaults, unsaved', async () => {
    const shop = (await client('admin').rpc('get_job_photo_shop', { p_engagement_id: engagementId(7) })).data as Row;
    expect(shop).toMatchObject({ saved: false, gallery_key: null, price_per_photo_minor: 2500, all_photos_price_minor: 25000 });
  });

  it('the client sees 15 watermarked previews, the delivered order and nothing free left', async () => {
    const { data, error } = await gallery(client());
    expect(error).toBeNull();
    const g = data as { shop: Row; photos: Row[] };
    expect(g.photos).toHaveLength(15);
    expect(g.shop).toMatchObject({ has_shop: true, open: true, included_left: 0, spent_minor: 5000 });
    expect((g.shop.bought_image_keys as string[]).length).toBe(5);
    expect((g.shop.orders as Row[])[0]).toMatchObject({ status: 'delivered' });
    expect(String((g.shop.orders as Row[])[0].delivery_url)).toMatch(/^https:\/\//);
    expect('gallery_key' in g.shop).toBe(false);
  });

  it('a shoot with no shop answers no_gallery (the portal then shows nothing)', async () => {
    const c = client('admin');
    const { error } = await gallery(c, engagementId(7));
    expect(await errorCode(error)).toBe('no_gallery');
  });

  it('two extra photos cost ₪50, go to the pay page and become paid when paid', async () => {
    const c = client();
    const placed = (await order(c, [key(6), key(7)])).data as Row;
    expect(placed).toMatchObject({ status: 'awaiting_payment', totalMinor: 5000 });
    expect(placed.payToken).toEqual(expect.any(String));
    const g = (await gallery(c)).data as { shop: Row };
    expect(g.shop.awaiting_image_keys).toEqual([key(6), key(7)]);

    const paid = await c.functions.invoke('job-payment-request-public', { body: { token: placed.payToken, action: 'create_charge' } });
    expect(paid.error).toBeNull();
    const after = (await gallery(c)).data as { shop: Row };
    expect(after.shop.bought_image_keys).toEqual(expect.arrayContaining([key(6), key(7)]));
    expect(after.shop.spent_minor).toBe(10000);
  });

  it('a new cart replaces the unpaid one; bought photos are refused', async () => {
    const c = client();
    const first = (await order(c, [key(6)])).data as Row;
    await order(c, [key(6), key(8)]);
    const orders = (c.db.job_photo_orders ?? []).filter((o) => o.id === first.orderId);
    expect(orders[0].status).toBe('cancelled');
    const { error } = await order(c, [key(1)]);
    expect(await errorCode(error)).toBe('already_bought');
  });

  it('all photos: ₪250 less the ₪50 already paid, capped at the per-photo price', async () => {
    const placed = (await order(client(), [], true)).data as Row;
    expect(placed).toMatchObject({ status: 'awaiting_payment', totalMinor: 20000 });
  });

  it('the admin delivers a paid order with an https link and the client is emailed', async () => {
    const c = client();
    const placed = (await order(c, [key(9)])).data as Row;
    await c.functions.invoke('job-payment-request-public', { body: { token: placed.payToken, action: 'create_charge' } });
    c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
    const bad = await c.functions.invoke('deliver-photo-order', { body: { orderId: placed.orderId, deliveryUrl: 'http://x' } });
    expect(bad.error).not.toBeNull();
    const ok = await c.functions.invoke('deliver-photo-order', {
      body: { orderId: placed.orderId, deliveryUrl: 'https://photos.example.com/d/abc' },
    });
    expect(ok.data).toEqual({ delivered: true, emailed: true });
  });

  it('only the shoot\'s client or the studio admin; signed-out callers are refused', async () => {
    expect((await gallery(client('none'))).error).not.toBeNull();
    const admin = client('admin');
    expect((await gallery(admin)).error).toBeNull();
    const { error } = await order(admin, [key(6)]);
    expect(await errorCode(error)).toBe('not_this_client');
  });
});

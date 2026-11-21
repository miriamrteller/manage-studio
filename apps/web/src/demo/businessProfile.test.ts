import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseRpcs } from './rpcs';
import { extraRpcs, hooks, views } from './extensions';
import { ADMIN_EMAIL, ADMIN_USER_ID, TENANT_ID, buildSeed } from './seed';

function client(admin = true) {
  const c = new FakeSupabaseClient({ tables: buildSeed(), rpcs: { ...baseRpcs, ...extraRpcs }, functions: {}, hooks, views });
  if (admin) c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  return c;
}

const config = async (c: FakeSupabaseClient) =>
  ((await c.rpc('get_tenant_config_by_subdomain', { p_subdomain: 'demo' })).data as Array<Record<string, unknown>>)[0];

describe('demo: Settings → Your business', () => {
  it('saves the profile and the studio config reads it back', async () => {
    const c = client();
    const res = await c.rpc('set_business_profile', {
      p_tenant_id: TENANT_ID, p_payment_flow: 'project', p_teaches_classes: true,
      p_family_accounts: false, p_client_booking: true,
    });
    expect(res.error).toBeNull();
    const t = await config(c);
    expect([t.payment_flow, t.teaches_classes, t.family_accounts, t.client_booking]).toEqual(['project', true, false, true]);
  });

  it('null keeps a field; a bad flow or a non-admin is refused', async () => {
    const c = client();
    const before = await config(c);
    await c.rpc('set_business_profile', { p_tenant_id: TENANT_ID, p_client_booking: !before.client_booking });
    const after = await config(c);
    expect(after.payment_flow).toBe(before.payment_flow);
    expect(after.client_booking).toBe(!before.client_booking);
    expect((await c.rpc('set_business_profile', { p_tenant_id: TENANT_ID, p_payment_flow: 'weekly' })).error).not.toBeNull();
    expect((await client(false).rpc('set_business_profile', { p_tenant_id: TENANT_ID })).error).not.toBeNull();
  });
});

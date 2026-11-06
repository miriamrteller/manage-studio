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

type State = { feature_key: string; feature_set: string; is_on: boolean };

describe('demo: Settings → Features', () => {
  it('lists only switchable features the studio has; core ones are not listed', async () => {
    const res = await client().rpc('studio_feature_states', { p_tenant_id: TENANT_ID });
    expect(res.error).toBeNull();
    expect(res.data as State[]).toEqual([
      expect.objectContaining({ feature_key: 'billing:delivery.gated', feature_set: 'projects', is_on: true }),
    ]);
  });

  it('switching off hides it from the feature gate; switching back on restores it', async () => {
    const c = client();
    const args = { p_tenant_id: TENANT_ID, p_feature_key: 'billing:delivery.gated' };
    expect((await c.rpc('set_feature_optout', { ...args, p_off: true })).error).toBeNull();
    expect(((await c.rpc('studio_feature_states', { p_tenant_id: TENANT_ID })).data as State[])[0].is_on).toBe(false);
    expect((await c.rpc('get_tenant_features', { p_tenant_id: TENANT_ID })).data).not.toContain('billing:delivery.gated');
    await c.rpc('set_feature_optout', { ...args, p_off: false });
    expect((await c.rpc('get_tenant_features', { p_tenant_id: TENANT_ID })).data).toContain('billing:delivery.gated');
  });

  it('core features and non-admins are refused', async () => {
    const core = await client().rpc('set_feature_optout', { p_tenant_id: TENANT_ID, p_feature_key: 'finance:expenses.basic', p_off: true });
    expect(core.error).not.toBeNull();
    expect((await client(false).rpc('studio_feature_states', { p_tenant_id: TENANT_ID })).error).not.toBeNull();
  });
});

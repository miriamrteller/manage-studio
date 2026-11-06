import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient, type Row } from './fakeSupabase';
import { baseFunctions } from './functions';
import { baseRpcs } from './rpcs';
import { extraFunctions, extraRpcs, hooks, views } from './extensions';
import { smugmugFunctions, smugmugRpcs } from './smugmug';
import { ADMIN_EMAIL, ADMIN_USER_ID, CLIENT_USER_ID, DEMO_CLIENT, buildSeed } from './seed';

function client(who: 'admin' | 'client' = 'admin') {
  const c = new FakeSupabaseClient({
    tables: buildSeed(),
    rpcs: { ...baseRpcs, ...extraRpcs, ...smugmugRpcs },
    functions: { ...baseFunctions, ...extraFunctions, ...smugmugFunctions },
    hooks,
    views,
  });
  if (who === 'admin') c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  else c.setUser({ id: CLIENT_USER_ID, email: DEMO_CLIENT.email });
  return c;
}

const status = async (c: FakeSupabaseClient) => ((await c.rpc('tenant_smugmug_status', {})).data as Row[])[0];
const action = async (c: FakeSupabaseClient, a: string) =>
  (await c.functions.invoke('smugmug-connection', { body: { action: a } })).data as Row;

describe('demo SmugMug settings', () => {
  it('the demo studio starts connected and Test connection says so', async () => {
    const c = client();
    expect(await status(c)).toMatchObject({ has_keys: true, connected: true });
    expect(await action(c, 'test')).toEqual({ ok: true, stage: 'account' });
  });

  it('new keys end the connection; Connect never goes to SmugMug', async () => {
    const c = client();
    expect((await c.rpc('save_tenant_smugmug_credentials', { p_api_key: 'k', p_api_secret: 's' })).error).toBeNull();
    expect(await status(c)).toMatchObject({ has_keys: true, connected: false });
    expect(await action(c, 'test')).toEqual({ ok: true, stage: 'keys' });
    expect(await action(c, 'start')).toEqual({ ok: false, code: 'unreachable' });
    expect((await c.rpc('save_tenant_smugmug_credentials', { p_api_key: ' ', p_api_secret: 's' })).error).not.toBeNull();
  });

  it('disconnect keeps the keys; clients are refused', async () => {
    const c = client();
    await c.rpc('disconnect_tenant_smugmug', {});
    expect(await status(c)).toMatchObject({ has_keys: true, connected: false });
    expect((await client('client').rpc('tenant_smugmug_status', {})).error).not.toBeNull();
  });

  it('demo sign-ins have a password, so the set-password prompt stays away', async () => {
    expect((await client('client').rpc('my_login_has_password', {})).data).toBe(true);
  });
});

describe('demo expense categories', () => {
  it('the photographer starts with its skin set, each showing the catalogue names', async () => {
    const c = client();
    const { data } = await c.from('expense_categories').select('*, catalog:expense_category_catalog(name_en, name_he)');
    const cats = data as Row[];
    expect(cats).toHaveLength(14);
    const printing = cats.find((r) => r.catalog_key === 'printing');
    expect(printing?.catalog).toEqual({ name_en: 'Printing and albums', name_he: 'הדפסות ואלבומים' });
    const sets = (await c.from('verticals').select('id, expense_categories').in('id', ['photographer', 'generic'])).data as Row[];
    expect(sets).toHaveLength(2);
    expect((await client('client').from('expense_categories').select('*')).data).toEqual([]);
  });
});

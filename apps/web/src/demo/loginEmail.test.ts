import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseRpcs } from './rpcs';
import { extraRpcs, hooks, views } from './extensions';
import { ADMIN_EMAIL, ADMIN_USER_ID, DEMO_CLIENT, buildSeed } from './seed';

function client(signedIn = true) {
  const c = new FakeSupabaseClient({ tables: buildSeed(), rpcs: { ...baseRpcs, ...extraRpcs }, functions: {}, hooks, views });
  if (signedIn) c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  return c;
}

const status = async (c: FakeSupabaseClient, email: string) => (await c.rpc('login_email_status', { p_email: email })).data;

describe('demo: change login email (login_email_status)', () => {
  it('answers like the real check', async () => {
    const c = client();
    expect(await status(c, 'not-an-email')).toBe('invalid');
    expect(await status(c, ADMIN_EMAIL.toUpperCase())).toBe('same');
    expect(await status(c, 'admin@opalswift.com')).toBe('reserved');
    expect(await status(c, DEMO_CLIENT.email)).toBe('taken');
    expect(await status(c, 'new.address@example.test')).toBe('ok');
  });

  it('needs a signed-in user', async () => {
    expect((await client(false).rpc('login_email_status', { p_email: 'a@example.test' })).error).not.toBeNull();
  });
});

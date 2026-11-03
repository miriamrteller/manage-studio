import { describe, expect, it, vi } from 'vitest';

// Run the shared demo code against the ballet fixtures, as the ballet build does.
vi.mock('./seed', async () => import('./ballet/seed'));

import { validateSignerDetails } from '@shared/signerDetails';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseRpcs } from './rpcs';
import { ADMIN_EMAIL, ADMIN_USER_ID, CLIENT_USER_ID, DEMO_CLIENT, DEMO_SIGNER, buildSeed } from './ballet/seed';

function client() {
  return new FakeSupabaseClient({ tables: buildSeed(), rpcs: baseRpcs, functions: {} });
}

describe('ballet demo: prefilled signer details', () => {
  it('gives the demo parent made-up details that pass the app checks', async () => {
    const c = client();
    c.setUser({ id: CLIENT_USER_ID, email: DEMO_CLIENT.email });
    const { data, error } = await c.rpc('get_my_last_signer_details');
    expect(error).toBeNull();
    expect(data).toEqual(DEMO_SIGNER);
    const checked = validateSignerDetails(
      { signer: data, child: { full_name: 'Tamar Levi', date_of_birth: '2017-04-12' }, confirmed: true, confirmed_wording: 'These details are correct' },
      { requireChild: true },
    );
    expect(checked.ok).toBe(true);
  });

  it('prefills nothing for anyone else', async () => {
    const c = client();
    c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
    expect((await c.rpc('get_my_last_signer_details')).data).toBeNull();
  });
});

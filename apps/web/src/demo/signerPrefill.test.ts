/**
 * The demo contract link fills in the client's name and phone like the real
 * get-waiver-engagement (signerPrefill), and never the ID number or address.
 */
import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseFunctions, contractToken } from './functions';
import { buildSeed, engagementId } from './seed';

function client() {
  const tables = buildSeed();
  return { c: new FakeSupabaseClient({ tables, rpcs: {}, functions: baseFunctions }), tables };
}

type SignerPrefillResponse = { signerPrefill?: Record<string, string> };

const invoke = (c: FakeSupabaseClient, token: string) =>
  c.functions.invoke('get-waiver-engagement', {
    body: {},
    headers: { Authorization: `WaiverToken ${token}` },
  }) as Promise<{ data: SignerPrefillResponse | null; error: unknown }>;

describe('demo guest contract link prefill', () => {
  it("prefills Yossi's name, email and phone, never ID or address", async () => {
    const { c } = client();
    const { data } = await invoke(c, contractToken(engagementId(2)));
    expect(data?.signerPrefill).toEqual({
      full_name: 'Yossi Ben-David',
      email: 'yossi.bendavid@example.com',
      phone: '+972 54-772-1903',
    });
  });

  it('an invalid link prefills nothing', async () => {
    const { c } = client();
    const { data, error } = await invoke(c, 'not-a-demo-token');
    expect(error).not.toBeNull();
    expect(data?.signerPrefill).toBeUndefined();
  });
});

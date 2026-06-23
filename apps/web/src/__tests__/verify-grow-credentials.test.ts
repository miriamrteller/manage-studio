/**
 * G7: GrowPaymentProvider.verifyCredentials pings Grow and reports a valid/invalid health result.
 * Run: pnpm -C apps/web test verify-grow-credentials.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';

function makeService(hasCreds = true) {
  return {
    rpc: async () => ({
      data: hasCreds
        ? [{ payment_provider_public_key: 'page_code_123', payment_provider_secret_key: 'api_key' }]
        : [],
      error: null,
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { payment_provider_account_id: 'grow_user_1' }, error: null }),
        }),
      }),
    }),
  } as never;
}

afterEach(() => vi.restoreAllMocks());

describe('GrowPaymentProvider.verifyCredentials', () => {
  it('returns valid when Grow responds with status 1', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 1 }), { status: 200 }),
    );
    const provider = new GrowPaymentProvider(makeService());
    const result = await provider.verifyCredentials('00000000-0000-0000-0000-0000000000aa');
    expect(result.valid).toBe(true);
  });

  it('returns invalid with the provider message when Grow rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 0, err: { message: 'bad api key' } }), { status: 200 }),
    );
    const provider = new GrowPaymentProvider(makeService());
    const result = await provider.verifyCredentials('00000000-0000-0000-0000-0000000000aa');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/bad api key/i);
  });

  it('returns invalid without calling the API when credentials are missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = new GrowPaymentProvider(makeService(false));
    const result = await provider.verifyCredentials('00000000-0000-0000-0000-0000000000aa');
    expect(result.valid).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

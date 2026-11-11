/**
 * "Send shop link": the studio makes a 3-day link; the /shop/:token page swaps it for
 * the client's session. Run: pnpm -C apps/web test photo-shop-link.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const setSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, auth: { setSession } } }));

import { PhotoShopLinkService, shopLinkMessage } from '@/features/jobs/services/photoShopLinkService';

beforeEach(() => {
  invoke.mockReset();
  setSession.mockReset();
});

describe('PhotoShopLinkService', () => {
  it('create: asks for a link for the shoot', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, url: 'https://studio.opalswift.com/shop/t', email: 'client@example.com', expiresAt: '2026-11-14T10:00:00Z' },
      error: null,
    });
    await expect(PhotoShopLinkService.create('e1')).resolves.toEqual({
      url: 'https://studio.opalswift.com/shop/t',
      email: 'client@example.com',
      expiresAt: '2026-11-14T10:00:00Z',
    });
    expect(invoke).toHaveBeenCalledWith('photo-shop-link', { body: { action: 'create', engagementId: 'e1' } });
  });

  it('create: passes on "no_email"', async () => {
    invoke.mockResolvedValue({ data: { ok: false, code: 'no_email' }, error: null });
    await expect(PhotoShopLinkService.create('e1')).rejects.toMatchObject({ code: 'no_email' });
  });

  it('open: signs in with the session the link gives', async () => {
    invoke.mockResolvedValue({ data: { ok: true, access_token: 'a', refresh_token: 'r', engagementId: 'e1' }, error: null });
    setSession.mockResolvedValue({ error: null });
    await PhotoShopLinkService.open('t');
    expect(invoke).toHaveBeenCalledWith('photo-shop-link', { body: { action: 'open', token: 't' } });
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
  });

  it('open: an expired link does not sign anyone in', async () => {
    invoke.mockResolvedValue({ data: { ok: false, code: 'expired' }, error: null });
    await expect(PhotoShopLinkService.open('old')).rejects.toMatchObject({ code: 'expired' });
    expect(setSession).not.toHaveBeenCalled();
  });

  it('message puts the link on its own line', () => {
    expect(shopLinkMessage('Your photos:', 'https://x/shop/t')).toBe('Your photos:\nhttps://x/shop/t');
  });
});

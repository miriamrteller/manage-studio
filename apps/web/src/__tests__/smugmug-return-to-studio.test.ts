/**
 * SmugMug returns to the one fixed callback on app.<root>; the callback page then carries
 * the same token and verifier on to the studio's own address, where the admin is signed in.
 * Run: pnpm -C apps/web test smugmug-return-to-studio.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc: vi.fn() } }));

import { SmugMugService } from '@/features/settings/services/smugmugService';
import { smugmugStudioCallbackUrl } from '@/pages/SmugMugCallbackPage';

beforeEach(() => invoke.mockReset());

describe('smugmugStudioCallbackUrl', () => {
  const search = '?oauth_token=t&oauth_verifier=v';

  it('sends app.<root> on to the studio address with the same token and verifier', () => {
    expect(smugmugStudioCallbackUrl('https://studio.opalswift.com', 'https://app.opalswift.com', search)).toBe(
      'https://studio.opalswift.com/admin/setup/integrations/smugmug/callback?oauth_token=t&oauth_verifier=v',
    );
  });

  it('does nothing when already on the studio address (no loop)', () => {
    expect(smugmugStudioCallbackUrl('https://app.opalswift.com', 'https://app.opalswift.com', search)).toBeNull();
  });

  it('refuses anything that is not a web address', () => {
    expect(smugmugStudioCallbackUrl('javascript:alert(1)', 'https://app.opalswift.com', search)).toBeNull();
    expect(smugmugStudioCallbackUrl('not a url', 'https://app.opalswift.com', search)).toBeNull();
  });
});

describe('SmugMugService.studioUrl', () => {
  it('asks the server for the studio address of the pending request', async () => {
    invoke.mockResolvedValue({ data: { ok: true, studio_url: 'https://studio.opalswift.com' }, error: null });
    await expect(SmugMugService.studioUrl('t')).resolves.toBe('https://studio.opalswift.com');
    expect(invoke).toHaveBeenCalledWith('smugmug-connection', { body: { action: 'studio_url', oauth_token: 't' } });
  });

  it('fails when the server finds no pending request', async () => {
    invoke.mockResolvedValue({ data: { ok: false, code: 'expired' }, error: null });
    await expect(SmugMugService.studioUrl('bad')).rejects.toThrow();
  });
});

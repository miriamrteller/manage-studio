/**
 * Google returns to the one registered address on app.<root>; the callback page then carries
 * the same code and state on to the studio's own address, where the admin is signed in.
 * Run: pnpm -C apps/web test google-calendar-return-to-studio.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc: vi.fn() } }));

import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';
import { studioCallbackUrl } from '@/pages/GoogleCalendarCallbackPage';

beforeEach(() => invoke.mockReset());

describe('studioCallbackUrl', () => {
  const search = '?code=abc&state=p.s';

  it('sends app.<root> on to the studio address with the same code and state', () => {
    expect(studioCallbackUrl('https://studio.opalswift.com', 'https://app.opalswift.com', search)).toBe(
      'https://studio.opalswift.com/admin/setup/integrations/google/callback?code=abc&state=p.s',
    );
  });

  it('works for a studio on its own domain', () => {
    expect(studioCallbackUrl('https://book.example.com', 'https://app.opalswift.com', search)).toBe(
      'https://book.example.com/admin/setup/integrations/google/callback?code=abc&state=p.s',
    );
  });

  it('does nothing when already on the studio address (no loop)', () => {
    expect(studioCallbackUrl('https://app.opalswift.com', 'https://app.opalswift.com', search)).toBeNull();
  });

  it('refuses anything that is not a web address', () => {
    expect(studioCallbackUrl('javascript:alert(1)', 'https://app.opalswift.com', search)).toBeNull();
    expect(studioCallbackUrl('not a url', 'https://app.opalswift.com', search)).toBeNull();
  });
});

describe('GoogleCalendarService.studioUrl', () => {
  it('asks the server for the studio address of the signed state', async () => {
    invoke.mockResolvedValue({ data: { studio_url: 'https://studio.opalswift.com' }, error: null });
    await expect(GoogleCalendarService.studioUrl('p.s')).resolves.toBe('https://studio.opalswift.com');
    expect(invoke).toHaveBeenCalledWith('google-calendar-oauth-callback', {
      body: { action: 'studio_url', state: 'p.s' },
    });
  });

  it('fails when the server refuses the state', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('non-2xx') });
    await expect(GoogleCalendarService.studioUrl('bad')).rejects.toThrow();
  });
});

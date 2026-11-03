/**
 * Connecting Google Calendar: when the server refuses, the admin sees a plain sentence, never the
 * generic "Edge Function returned a non-2xx status code" (issues #283, #284).
 * Run: pnpm -C apps/web test google-calendar-connect-error.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc: vi.fn() } }));

import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';

/** What supabase-js hands back for a non-2xx: a generic message plus the real body on `context`. */
const refused = (status: number, body: unknown) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(JSON.stringify(body), { status }),
  }),
});

beforeEach(() => invoke.mockReset());

describe('GoogleCalendarService.start', () => {
  it('a server that is not set up says so in plain words, not "non-2xx"', async () => {
    invoke.mockResolvedValue(refused(500, { error: 'OAuth is not configured' }));
    const error = await GoogleCalendarService.start().catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('non-2xx');
    expect((error as Error).message).not.toContain('OAuth is not configured');
    expect((error as Error).message).toMatch(/Google Calendar/);
  });

  it('a missing server setting is the same plain sentence', async () => {
    invoke.mockResolvedValue(refused(500, { error: 'APP_URL is not configured on the server' }));
    const error = (await GoogleCalendarService.start().catch((e: Error) => e)) as Error;
    expect(error.message).toMatch(/Google Calendar/);
    expect(error.message).not.toContain('APP_URL');
  });

  it('keeps a server message that is meant for the admin', async () => {
    invoke.mockResolvedValue(refused(403, { error: 'feature_not_available' }));
    const error = (await GoogleCalendarService.start().catch((e: Error) => e)) as Error;
    expect(error.message).toBe('feature_not_available');
  });

  it('a failure with no readable body still never says "non-2xx"', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned a non-2xx status code') });
    const error = (await GoogleCalendarService.start().catch((e: Error) => e)) as Error;
    expect(error.message).not.toContain('non-2xx');
  });
});

describe('GoogleCalendarService.disconnect', () => {
  it('shows a plain sentence when the server refuses', async () => {
    invoke.mockResolvedValue(refused(500, { error: 'Failed to disconnect' }));
    const error = (await GoogleCalendarService.disconnect().catch((e: Error) => e)) as Error;
    expect(error.message).not.toContain('non-2xx');
  });
});

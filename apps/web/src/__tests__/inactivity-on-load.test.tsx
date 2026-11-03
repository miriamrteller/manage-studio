// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  order: [] as string[],
  session: { user: { id: 'u1' } } as { user: { id: string } } | null,
  getSession: vi.fn(),
  signOutDelay: 0,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => h.getSession(...args),
    },
  },
}));
vi.mock('@/lib/inactivity/signOutForInactivity', () => ({
  signOutForInactivity: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, h.signOutDelay));
    h.order.push('signed-out');
  }),
}));

import { enforceInactivityOnLoad } from '@/lib/inactivity/enforceOnLoad';
import { LAST_ACTIVITY_KEY, readLastActivity } from '@/lib/inactivity/activityStore';

let replaceState: ReturnType<typeof vi.spyOn>;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-04T09:00:00Z').getTime();

beforeEach(() => {
  localStorage.clear();
  h.order = [];
  h.session = { user: { id: 'u1' } };
  h.signOutDelay = 0;
  h.getSession.mockReset();
  h.getSession.mockImplementation(async () => ({ data: { session: h.session } }));
  // Assert the call, not the real address bar: other test files in the same run can replace history.
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('enforceInactivityOnLoad (browser reopened the next day)', () => {
  it('signs out a stale session and switches the address to the sign-in page with the notice', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 20 * HOUR));
    expect(await enforceInactivityOnLoad(NOW)).toBe(true);
    expect(h.order).toEqual(['signed-out']);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/login?reason=inactivity');
  });

  it('does not touch a recent session, and does not even look it up (no delay on a normal load)', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 10 * 60 * 1000));
    expect(await enforceInactivityOnLoad(NOW)).toBe(false);
    expect(h.getSession).not.toHaveBeenCalled();
    expect(h.order).toEqual([]);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('exactly an hour is still fine; a moment more is not', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - HOUR));
    expect(await enforceInactivityOnLoad(NOW)).toBe(false);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - HOUR - 1));
    expect(await enforceInactivityOnLoad(NOW)).toBe(true);
  });

  it('never signs anyone out when there is no recorded time (first load after this feature)', async () => {
    expect(await enforceInactivityOnLoad(NOW)).toBe(false);
    expect(h.getSession).not.toHaveBeenCalled();
  });

  it('a stale time with nobody signed in just drops the stale time (no notice for a visitor)', async () => {
    h.session = null;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 20 * HOUR));
    expect(await enforceInactivityOnLoad(NOW)).toBe(false);
    expect(h.order).toEqual([]);
    expect(readLastActivity()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('if the session lookup fails it does not sign anyone out or block the app', async () => {
    h.getSession.mockRejectedValue(new Error('offline'));
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 20 * HOUR));
    await expect(enforceInactivityOnLoad(NOW)).resolves.toBe(false);
    expect(h.order).toEqual([]);
  });
});

describe('the app does not draw anything until that check has finished', () => {
  const render = vi.fn();
  let finishCheck: (v: boolean) => void = () => undefined;

  beforeEach(() => {
    vi.resetModules();
    render.mockReset();
    document.body.innerHTML = '<div id="root"></div>';
    vi.doMock('react-dom/client', () => ({ default: { createRoot: () => ({ render }) } }));
    vi.doMock('@/App.tsx', () => ({ default: () => null }));
    vi.doMock('@/fonts', () => ({}));
    vi.doMock('@/index.css', () => ({}));
    vi.doMock('@/lib/monitoring', () => ({ initMonitoring: () => undefined }));
    vi.doMock('@/lib/inactivity/enforceOnLoad', () => ({
      enforceInactivityOnLoad: () =>
        new Promise<boolean>((resolve) => {
          finishCheck = resolve;
        }).then((v) => {
          h.order.push('check-finished');
          return v;
        }),
    }));
    render.mockImplementation(() => h.order.push('rendered'));
  });

  it('renders only after a stale session has been signed out', async () => {
    await import('../main');
    await Promise.resolve();
    expect(render).not.toHaveBeenCalled(); // no dashboard while the check runs
    finishCheck(true);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(h.order).toEqual(['check-finished', 'rendered']);
  });

  it('still renders if the check itself fails', async () => {
    vi.doMock('@/lib/inactivity/enforceOnLoad', () => ({ enforceInactivityOnLoad: () => Promise.reject(new Error('boom')) }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await import('../main');
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  });
});

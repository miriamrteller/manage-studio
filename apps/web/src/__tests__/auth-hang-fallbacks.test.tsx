// @vitest-environment jsdom
/**
 * A saved session whose refresh or profile call never answers must not leave the app on
 * "Loading..." forever (prod: app.opalswift.com after more than an hour idle).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { withTimeout } from '@/lib/withTimeout';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      signOut: (...a: unknown[]) => h.signOut(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: h.unsubscribe } } }),
    },
  },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/lib/query-client', () => ({ default: { clear: vi.fn() } }));

import { useAuthSession } from '@/hooks/useAuth';
import { dropSavedSession, signOutForInactivity } from '@/lib/inactivity/signOutForInactivity';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  h.getSession.mockReset();
  h.signOut.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('gives the result when it arrives in time, the fallback when it does not', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'late')).resolves.toBe('ok');
    const slow = withTimeout(new Promise<string>(() => undefined), 1000, 'late');
    await vi.advanceTimersByTimeAsync(1001);
    await expect(slow).resolves.toBe('late');
  });

  it('passes a rejection through', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 1000, 'late')).rejects.toThrow('x');
  });
});

describe('useAuthSession when the session never loads', () => {
  it('stops loading after the wait limit and carries on signed out', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.getSession.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_100);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('stops loading when reading the session throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.getSession.mockRejectedValue(new Error('storage'));
    const { result } = renderHook(() => useAuthSession());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('signing out when the sign-out call hangs', () => {
  it('still completes and removes the saved session from this browser', async () => {
    localStorage.setItem('sb-abc-auth-token', '{"access_token":"x"}');
    localStorage.setItem('unrelated', 'keep');
    h.signOut.mockImplementation(() => new Promise(() => undefined));
    const done = signOutForInactivity();
    await vi.advanceTimersByTimeAsync(3_100);
    await done;
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('dropSavedSession only removes auth-token keys', () => {
    localStorage.setItem('sb-abc-auth-token', '1');
    localStorage.setItem('sb-abc-auth-token-code-verifier', '1');
    localStorage.setItem('theme', 'dark');
    dropSavedSession();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});

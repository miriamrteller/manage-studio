// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const h = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as { user: { id: string } } | null,
  signOut: vi.fn(async () => undefined),
  navigate: vi.fn(),
  isMutating: vi.fn(() => 0),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: h.session, isLoading: false }) }));
vi.mock('@/lib/inactivity/signOutForInactivity', () => ({ signOutForInactivity: h.signOut }));
vi.mock('@/router', () => ({ default: { navigate: h.navigate } }));
vi.mock('@/lib/query-client', () => ({ default: { isMutating: h.isMutating, clear: vi.fn() } }));

import { InactivityGuard } from '@/components/Auth/InactivityGuard';
import { LAST_ACTIVITY_KEY, SIGNED_OUT_KEY, readLastActivity } from '@/lib/inactivity/activityStore';
import {
  ACTIVITY_THROTTLE_MS,
  INACTIVITY_LOGIN_PATH,
  MAX_SIGN_OUT_DEFERRAL_MS,
  setInactivitySignOutEnabled,
} from '@/lib/inactivity/config';

const MIN = 60 * 1000;
const START = new Date('2026-11-03T09:00:00Z').getTime();

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function fire(type: string) {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(START);
  localStorage.clear();
  h.session = { user: { id: 'u1' } };
  h.signOut.mockClear();
  h.navigate.mockClear();
  h.isMutating.mockReset();
  h.isMutating.mockReturnValue(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setInactivitySignOutEnabled(true);
});

describe('InactivityGuard', () => {
  it('signs out after an hour with no activity, and goes to the sign-in page with the notice', async () => {
    render(<InactivityGuard />);
    await advance(59 * MIN);
    expect(h.signOut).not.toHaveBeenCalled();
    await advance(2 * MIN);
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith(INACTIVITY_LOGIN_PATH, { replace: true });
    expect(INACTIVITY_LOGIN_PATH).toBe('/login?reason=inactivity');
  });

  it('does nothing at all when nobody is signed in (public pages are unaffected)', async () => {
    h.session = null;
    render(<InactivityGuard />);
    await advance(3 * 60 * MIN);
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull();
  });

  it('does nothing in the demo build (its entry point turns it off)', async () => {
    setInactivitySignOutEnabled(false);
    render(<InactivityGuard />);
    await advance(3 * 60 * MIN);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('starts the hour when a session has no recorded time yet', () => {
    render(<InactivityGuard />);
    expect(readLastActivity()).toBe(START);
  });

  it('input resets the hour: pointer, key, touch and scroll all count', async () => {
    render(<InactivityGuard />);
    for (const type of ['keydown', 'pointerdown', 'touchstart', 'scroll']) {
      await advance(50 * MIN);
      fire(type);
      expect(readLastActivity()).toBe(Date.now());
    }
    expect(h.signOut).not.toHaveBeenCalled();
    await advance(59 * MIN);
    expect(h.signOut).not.toHaveBeenCalled();
    await advance(2 * MIN);
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it('writes to storage at most once per throttle window, however much the pointer moves', async () => {
    render(<InactivityGuard />);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 200; i++) fire('pointermove');
    const writes = () => setItem.mock.calls.filter(([k]) => k === LAST_ACTIVITY_KEY).length;
    expect(writes()).toBe(1);
    await advance(ACTIVITY_THROTTLE_MS + 1);
    for (let i = 0; i < 200; i++) fire('pointermove');
    expect(writes()).toBe(2);
  });

  it('shares activity between tabs: activity elsewhere postpones the sign-out here', async () => {
    render(<InactivityGuard />);
    await advance(40 * MIN);
    // Another tab of this browser was used just now and wrote the shared time.
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: LAST_ACTIVITY_KEY, newValue: String(Date.now()) }));
    });
    await advance(30 * MIN); // 70 minutes after this tab's own last input
    expect(h.signOut).not.toHaveBeenCalled();
    await advance(31 * MIN); // an hour after the OTHER tab's activity
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it('even without a storage event, the deadline re-reads the shared time before signing out', async () => {
    render(<InactivityGuard />);
    await advance(59 * MIN);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())); // other tab active, event missed
    await advance(2 * MIN);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('another tab signing out for inactivity shows the notice here too, without a second sign-out', async () => {
    render(<InactivityGuard />);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SIGNED_OUT_KEY, newValue: String(Date.now()) }));
    });
    expect(h.navigate).toHaveBeenCalledWith(INACTIVITY_LOGIN_PATH, { replace: true });
    expect(h.signOut).not.toHaveBeenCalled();
  });

  describe('a tab that was in the background', () => {
    const setVisible = (state: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    afterEach(() => setVisible('visible'));

    it('coming back after more than an hour signs out; it does NOT count as activity', async () => {
      render(<InactivityGuard />);
      setVisible('hidden');
      vi.setSystemTime(START + 90 * MIN); // the laptop slept: timers did not run
      setVisible('visible');
      await advance(0);
      expect(h.signOut).toHaveBeenCalledTimes(1);
      expect(readLastActivity()).toBe(START); // not refreshed by the return
    });

    it('coming back within the hour counts as activity', async () => {
      render(<InactivityGuard />);
      setVisible('hidden');
      vi.setSystemTime(START + 30 * MIN);
      setVisible('visible');
      expect(readLastActivity()).toBe(START + 30 * MIN);
      expect(h.signOut).not.toHaveBeenCalled();
    });
  });

  describe('a save in progress', () => {
    it('is not cut off: the sign-out waits until it has finished', async () => {
      h.isMutating.mockReturnValue(1);
      render(<InactivityGuard />);
      await advance(61 * MIN);
      expect(h.signOut).not.toHaveBeenCalled();
      await advance(2 * MIN);
      expect(h.signOut).not.toHaveBeenCalled();
      h.isMutating.mockReturnValue(0);
      await advance(16 * 1000);
      expect(h.signOut).toHaveBeenCalledTimes(1);
    });

    it('but not for ever: after the cap it signs out anyway', async () => {
      h.isMutating.mockReturnValue(1);
      render(<InactivityGuard />);
      await advance(61 * MIN);
      await advance(MAX_SIGN_OUT_DEFERRAL_MS + 30 * 1000);
      expect(h.signOut).toHaveBeenCalledTimes(1);
    });
  });

  it('stops listening when the user signs out or the component goes away', async () => {
    const { unmount } = render(<InactivityGuard />);
    unmount();
    await advance(3 * 60 * MIN);
    expect(h.signOut).not.toHaveBeenCalled();
    fire('keydown'); // no listener left: nothing is written after the mount-time seed
    expect(readLastActivity()).toBe(START);
  });
});

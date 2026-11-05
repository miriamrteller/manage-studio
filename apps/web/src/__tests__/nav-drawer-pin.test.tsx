// @vitest-environment jsdom
/**
 * The pinned admin menu stays pinned. Only the Pin / Unpin control changes the saved choice;
 * closing the menu (menu button, Escape, Report a problem, sign out), a narrow window and
 * page changes never erase it. Storage that throws must not break the menu.
 * Run: pnpm -C apps/web test nav-drawer-pin.test.tsx
 */
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { NavDrawerProvider, useNavDrawer } from '@/components/Navigation/NavDrawerContext';

const KEY = 'nav-drawer-pinned';

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px });
}

const wrapper = ({ children }: { children: ReactNode }) => <NavDrawerProvider>{children}</NavDrawerProvider>;

beforeEach(() => {
  localStorage.clear();
  setWidth(1280);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('pinned menu', () => {
  it('starts pinned from the saved choice', () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    expect(result.current.isPinned).toBe(true);
  });

  it('closing the pinned menu (menu button, Escape, Report a problem, sign out) keeps the saved pin', () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('true');
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('a remount (e.g. the layout showing its loading state) comes back pinned', () => {
    localStorage.setItem(KEY, 'true');
    const first = renderHook(() => useNavDrawer(), { wrapper });
    act(() => first.result.current.close());
    first.unmount();
    const second = renderHook(() => useNavDrawer(), { wrapper });
    expect(second.result.current.isPinned).toBe(true);
  });

  it('a narrow window hides the menu but keeps the choice for when it is wide again', () => {
    localStorage.setItem(KEY, 'true');
    const { result, unmount } = renderHook(() => useNavDrawer(), { wrapper });
    act(() => {
      setWidth(500);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isPinned).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('true');
    unmount();
    setWidth(1280);
    expect(renderHook(() => useNavDrawer(), { wrapper }).result.current.isPinned).toBe(true);
  });

  it('Pin and Unpin are the only things that change the saved choice', () => {
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    act(() => result.current.openOverlay());
    act(() => result.current.pin());
    expect(localStorage.getItem(KEY)).toBe('true');
    act(() => result.current.unpin());
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    act(() => result.current.openOverlay());
    expect(() => act(() => result.current.pin())).not.toThrow();
    expect(result.current.isPinned).toBe(true);
    expect(() => act(() => result.current.unpin())).not.toThrow();
  });
});

describe('render sanity', () => {
  it('renders children', () => {
    const { getByText } = render(<NavDrawerProvider>hello</NavDrawerProvider>);
    expect(getByText('hello')).toBeTruthy();
  });
});

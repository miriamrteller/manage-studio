// @vitest-environment jsdom
/**
 * The menu is always there on a wide screen (owner, 13 Nov 2026). Its one switch is full size /
 * icons only: full size to start with, remembered per browser. A phone opens the menu from the
 * menu button, always at full size. Storage that throws must not break the menu.
 * Run: pnpm -C apps/web test nav-drawer-pin.test.tsx
 */
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { NavDrawerProvider, useNavDrawer } from '@/components/Navigation/NavDrawerContext';

const KEY = 'nav-drawer-icons-only';

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

describe('always-on menu', () => {
  it('is pinned at full size on a wide screen, with nothing saved', () => {
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    expect(result.current.isPinned).toBe(true);
    expect(result.current.isIconsOnly).toBe(false);
  });

  it('cannot be closed on a wide screen (menu button, Escape, Report a problem, sign out)', () => {
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    act(() => result.current.close());
    act(() => result.current.toggle());
    expect(result.current.isPinned).toBe(true);
    expect(result.current.isOpen).toBe(true);
  });

  it('switches to icons only and back, and remembers it after a reload', () => {
    const first = renderHook(() => useNavDrawer(), { wrapper });
    act(() => first.result.current.toggleIconsOnly());
    expect(first.result.current.isIconsOnly).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');
    first.unmount();
    const second = renderHook(() => useNavDrawer(), { wrapper });
    expect(second.result.current.isIconsOnly).toBe(true);
    act(() => second.result.current.toggleIconsOnly());
    expect(second.result.current.isIconsOnly).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('a phone opens it from the menu button, at full size even when icons only is saved', () => {
    localStorage.setItem(KEY, 'true');
    setWidth(500);
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    expect(result.current.isPinned).toBe(false);
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isOverlay).toBe(true);
    expect(result.current.isIconsOnly).toBe(false);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('a narrow window hides it behind the menu button; wide again, it is back', () => {
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    act(() => {
      setWidth(500);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isPinned).toBe(false);
    act(() => {
      setWidth(1280);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isPinned).toBe(true);
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useNavDrawer(), { wrapper });
    expect(result.current.isIconsOnly).toBe(false);
    expect(() => act(() => result.current.toggleIconsOnly())).not.toThrow();
    expect(result.current.isIconsOnly).toBe(true);
  });
});

describe('render sanity', () => {
  it('renders children', () => {
    const { getByText } = render(<NavDrawerProvider>hello</NavDrawerProvider>);
    expect(getByText('hello')).toBeTruthy();
  });
});

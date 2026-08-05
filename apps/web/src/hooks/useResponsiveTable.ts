import { useEffect, useState } from 'react';

export interface UseResponsiveTableResult {
  isMobile: boolean;
  /** True when the caller should render cards instead of a <table>. */
  shouldShowCards: boolean;
}

/**
 * useResponsiveTable: reports whether the viewport is below `breakpoint`.
 *
 * Implementation notes
 * - Uses `matchMedia` with a `max-width` query rather than a resize listener.
 *   The browser then only notifies us when the boundary is actually crossed,
 *   instead of firing on every pixel of a drag, so no throttling is needed.
 * - The initial value is read synchronously during the first render, which
 *   avoids the one-frame flash of the wrong layout that a `useEffect`-only
 *   implementation produces.
 * - Guards `typeof window` so the hook is safe under SSR/prerender and in
 *   Vitest's node environment; it reports desktop in that case.
 * - `addEventListener('change')` with a symmetric `removeEventListener` in the
 *   cleanup; the effect re-subscribes if `breakpoint` changes.
 *
 * Default breakpoint is 768px, matching Tailwind's `md`, so the JS switch and
 * the CSS breakpoints stay in agreement.
 */
export function useResponsiveTable(breakpoint = 768): UseResponsiveTableResult {
  const query = `(max-width: ${breakpoint - 1}px)`;

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(query);
    // Re-sync in case the viewport changed between render and effect.
    setIsMobile(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return { isMobile, shouldShowCards: isMobile };
}

export default useResponsiveTable;

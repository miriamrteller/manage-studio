import { useEffect, useState } from 'react';

/** Tailwind `md` breakpoint — below this, calendars switch to a day-first mobile layout. */
const NARROW_QUERY = '(max-width: 767px)';

/**
 * Tracks whether the viewport is phone-sized. SSR/first paint defaults to `false`
 * (desktop toolbar) then corrects after mount to avoid hydration flicker in CSR.
 */
export function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_QUERY).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

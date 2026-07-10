import { useLayoutEffect, useRef, useState } from 'react';

/** Minimum height so the calendar stays usable on very short screens. */
const MIN_HEIGHT = 360;
/** Small gap left below the calendar so it isn't flush with the viewport edge. */
const BOTTOM_GAP = 16;

/**
 * Sizes an element to fill the remaining viewport height from its current top
 * position, so the calendar fits on screen without the page scrolling. Recomputes
 * on window resize. Avoids brittle `calc(100dvh - Xrem)` offsets that don't account
 * for the app header, page heading, and footer.
 */
export function useFitViewportHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    function update() {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(MIN_HEIGHT, window.innerHeight - top - BOTTOM_GAP));
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return { ref, height };
}

import type { ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { DirectionProvider } from '@base-ui/react/direction-provider';

/**
 * ⓘ help next to a heading or setting: a small round button that opens a short
 * explanation in a floating box just below it.
 *
 * Built on Base UI's Popover (not a hover tooltip), so it works the same with a
 * mouse, a finger and the keyboard: Enter/Space opens it, Escape or a tap
 * elsewhere closes it and focus returns to the button. Screen readers get
 * aria-expanded / aria-controls on the button. The box floats over the page,
 * never pushes the heading around, flips and shifts to stay on screen, and
 * follows the app's reading direction (Hebrew is right to left).
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  // `!min-h-0`: the coarse-pointer rule `button[type=button] { min-height: 44px }`
  // out-ranks a plain utility and stretched the round button into a tall pill;
  // touch-target-extend still gives fingers a 44px hit area.
  // DocumentLanguageSync keeps <html dir> in step with the chosen language.
  const direction =
    typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
  return (
    <DirectionProvider direction={direction}>
      <Popover.Root>
        <Popover.Trigger
          aria-label={label}
          className="touch-target-extend ms-1 inline-flex h-5 !min-h-0 w-5 !min-w-0 shrink-0 items-center justify-center rounded-full border p-0 align-middle text-xs font-semibold leading-none text-muted-foreground hover:text-foreground"
        >
          i
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[var(--z-tooltip)]">
            <Popover.Popup
              dir={direction}
              className="max-w-[min(20rem,calc(100vw-1rem))] rounded-md border bg-[var(--surface-base)] px-3 py-2 text-start text-sm font-normal leading-snug text-foreground shadow-md outline-none"
            >
              {children}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </DirectionProvider>
  );
}

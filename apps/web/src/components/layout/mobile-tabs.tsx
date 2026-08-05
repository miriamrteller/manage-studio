import React, { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Any icon component that accepts a className — matches the `lucide-react`
 * icons already used across the app.
 */
export type TabIconComponent = React.ComponentType<{ className?: string }>;

export interface MobileTab {
  id: string;
  label: string;
  icon: TabIconComponent;
  /** Unread/urgent count. Values above 99 render as "99+". */
  badge?: number;
  href: string;
  /** Mirror the icon horizontally in RTL (arrows, chevrons, next/prev). */
  directionalIcon?: boolean;
}

export interface MobileTabsProps {
  tabs: MobileTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  /** Accessible name for the tab strip. */
  label?: string;
}

/** Usability ceiling from the spec — beyond five, targets get too narrow. */
const MAX_TABS = 5;

function triggerHaptic() {
  // Guarded: vibrate is unavailable on iOS Safari and desktop.
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { vibrate?: (p: number) => boolean });
  try {
    nav?.vibrate?.(10);
  } catch {
    /* non-fatal: haptics are a nicety, never a requirement */
  }
}

/**
 * mobile-tabs: bottom tab bar that replaces the sidebar on small viewports.
 *
 * Design system
 * - `--surface-raised` background with a `--border-subtle` top edge.
 * - Active tab is `--color-primary` over a `--surface-sunken` indicator.
 * - Badges use `--color-error`, the urgency token.
 * - `.touch-target` guarantees the 48px minimum on every tab.
 * - `.pb-safe` adds `env(safe-area-inset-bottom)` so the strip clears the
 *   home indicator on notched devices.
 * - Icons opt into RTL mirroring through `.icon-directional`; semantic icons
 *   (home, settings) are left alone, which is the correct RTL behaviour.
 *
 * Accessibility
 * - role="tablist" / role="tab" with aria-selected and a roving tabIndex, so
 *   the strip is a single tab stop.
 * - Arrow keys move between tabs and are direction-aware: in RTL, ArrowLeft
 *   advances. Home/End jump to the ends.
 * - Badge counts are announced through an aria-label on the tab rather than
 *   being left as a bare decorative number.
 * - `href` is preserved on the element so middle-click/copy-link still work
 *   while the router handles activation via onTabChange.
 */
export function MobileTabs({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  label = 'Main navigation',
}: MobileTabsProps) {
  const visibleTabs = useMemo(() => tabs.slice(0, MAX_TABS), [tabs]);
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  const activate = useCallback(
    (tabId: string) => {
      triggerHaptic();
      onTabChange(tabId);
    },
    [onTabChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLAnchorElement>, index: number) => {
      const isRtl =
        typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

      let next: number | null = null;

      switch (event.key) {
        case 'ArrowRight':
          next = isRtl ? index - 1 : index + 1;
          break;
        case 'ArrowLeft':
          next = isRtl ? index + 1 : index - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = visibleTabs.length - 1;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          activate(visibleTabs[index].id);
          return;
        default:
          return;
      }

      if (next === null) return;
      const clamped = (next + visibleTabs.length) % visibleTabs.length;
      event.preventDefault();
      refs.current[clamped]?.focus();
    },
    [activate, visibleTabs],
  );

  return (
    <nav
      className={cn(
        'z-elevation-raised pb-safe fixed inset-x-0 bottom-0 md:hidden',
        'border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]',
        className,
      )}
      aria-label={label}
    >
      <ul role="tablist" aria-label={label} className="flex items-stretch justify-around">
        {visibleTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          const badge = tab.badge && tab.badge > 0 ? tab.badge : undefined;
          const badgeText = badge ? (badge > 99 ? '99+' : String(badge)) : undefined;

          return (
            <li key={tab.id} role="presentation" className="min-w-0 flex-1">
              {/* href is kept so copy-link and middle-click still work; the
                  router handles activation through onTabChange. */}
              <a
                ref={(element) => {
                  refs.current[index] = element;
                }}
                href={tab.href}
                role="tab"
                id={`mobile-tab-${tab.id}`}
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                aria-label={badge ? `${tab.label}, ${badge} unread` : tab.label}
                tabIndex={isActive ? 0 : -1}
                onClick={(event) => {
                  event.preventDefault();
                  activate(tab.id);
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  'touch-target relative w-full flex-col gap-1 px-1 py-2',
                  'motion-safe transition-colors duration-150',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2',
                  'focus-visible:outline-[var(--state-focus)]',
                  isActive
                    ? 'bg-[var(--surface-sunken)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] active:bg-[var(--state-active)]',
                )}
              >
                <span className="relative inline-flex">
                  <Icon
                    className={cn('h-6 w-6', tab.directionalIcon && 'icon-directional')}
                    aria-hidden="true"
                  />
                  {badgeText && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -top-1 min-w-[1.125rem] rounded-full px-1',
                        'text-center text-caption font-semibold leading-[1.125rem]',
                        'bg-[var(--color-error)] text-[var(--color-text-inverted)]',
                        // Logical offset so the badge stays on the outer edge in RTL.
                        'ltr:-right-2 rtl:-left-2',
                      )}
                    >
                      {badgeText}
                    </span>
                  )}
                </span>

                <span className="w-full truncate text-center text-caption">{tab.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileTabs;

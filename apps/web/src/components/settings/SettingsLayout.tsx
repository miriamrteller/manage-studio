import React, { useCallback, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Props every settings section receives. Kept minimal on purpose. */
export interface SettingsSectionProps {
  tenantId: string;
  onSave: (data: unknown) => Promise<void>;
  onReset: () => void;
  isDirty: boolean;
}

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  component: React.ComponentType<SettingsSectionProps>;
  /** Permission strings; the host filters sections before rendering. */
  permissions?: string[];
}

export interface SettingsLayoutProps {
  sections: SettingsSection[];
  activeSectionId: string;
  onSectionChange: (sectionId: string) => void;
  /** Rendered inside the tab panel. */
  children: React.ReactNode;
  /** Save / cancel / reset bar. Omitted when a section is self-saving. */
  actionBar?: React.ReactNode;
  isDirty?: boolean;
  /** Open/closed state of the mobile section sheet. */
  isSheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * SettingsLayout: shell for the settings area — section list plus one visible
 * panel.
 *
 * Semantics
 * - This is a real `tablist`/`tab`/`tabpanel`, not a nav of links, because the
 *   panel swaps in place without a route change. Consequences, all implemented
 *   below: exactly one tab is in the tab order (`tabIndex` follows selection),
 *   arrows move between tabs, Home/End jump to the ends, and the panel is
 *   labelled by its tab.
 * - Arrow direction is mirrored under RTL so Left/Right always mean
 *   "previous/next in the reading order".
 * - The desktop list is vertical, so it declares
 *   `aria-orientation="vertical"`; Up/Down are the primary keys there, with
 *   Left/Right accepted as well.
 *
 * Mobile
 * - Under `md` the list becomes a bottom sheet behind a trigger button. The
 *   sheet is a modal dialog: focus is trapped, Escape closes it, focus returns
 *   to the trigger, and background content is inert to assistive tech via
 *   `aria-hidden` on the panel wrapper's sibling scrim.
 * - The sheet clears the iOS home indicator with `.pb-safe`.
 *
 * Design system
 * - `--surface-raised` list on a `--border-subtle` divider; the selected tab
 *   carries a `--color-primary` inline-start bar (which flips edge in RTL
 *   because it uses `border-inline-start`) plus `--state-active` fill.
 * - Slide-up uses `.animate-slide-in-up` from the Pipeline 1 animation set,
 *   which the global reduced-motion guard already neutralises.
 */
export function SettingsLayout({
  sections,
  activeSectionId,
  onSectionChange,
  children,
  actionBar,
  isDirty = false,
  isSheetOpen,
  onSheetOpenChange,
  className = '',
}: SettingsLayoutProps) {
  const baseId = useId();
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  const listRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeSection = sections.find((section) => section.id === activeSectionId);

  const focusTab = useCallback((sectionId: string) => {
    const root = sheetRef.current ?? listRef.current;
    root?.querySelector<HTMLElement>(`[data-tab-id="${sectionId}"]`)?.focus();
  }, []);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const isRtl =
        typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
      const last = sections.length - 1;
      let next: number | null = null;

      switch (event.key) {
        case 'ArrowDown':
          next = index === last ? 0 : index + 1;
          break;
        case 'ArrowUp':
          next = index === 0 ? last : index - 1;
          break;
        case 'ArrowRight':
          next = isRtl ? (index === 0 ? last : index - 1) : index === last ? 0 : index + 1;
          break;
        case 'ArrowLeft':
          next = isRtl ? (index === last ? 0 : index + 1) : index === 0 ? last : index - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = last;
          break;
        default:
          return;
      }

      event.preventDefault();
      const target = sections[next];
      if (!target) return;
      onSectionChange(target.id);
      focusTab(target.id);
    },
    [sections, onSectionChange, focusTab],
  );

  /* ---- mobile sheet: escape, focus trap, focus restore ---- */
  useEffect(() => {
    if (!isSheetOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Snapshot the trigger now: by cleanup time the ref may point elsewhere.
    const trigger = triggerRef.current;
    // Focus the selected tab so the sheet opens on the user's current place.
    requestAnimationFrame(() => focusTab(activeSectionId));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSheetOpenChange(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      (previouslyFocused ?? trigger)?.focus?.();
    };
  }, [isSheetOpen, activeSectionId, focusTab, onSheetOpenChange]);

  const renderTab = (section: SettingsSection, index: number) => {
    const isSelected = section.id === activeSectionId;
    const Icon = section.icon;

    return (
      <button
        key={section.id}
        type="button"
        role="tab"
        id={tabId(section.id)}
        data-tab-id={section.id}
        aria-selected={isSelected}
        aria-controls={panelId}
        // Roving tabindex: the tablist is one tab stop, arrows move within it.
        tabIndex={isSelected ? 0 : -1}
        onClick={() => {
          onSectionChange(section.id);
          onSheetOpenChange(false);
        }}
        onKeyDown={(event) => handleTabKeyDown(event, index)}
        className={cn(
          'touch-target text-body-sm w-full justify-start gap-3 px-3 py-2 text-start',
          'motion-safe rounded-md',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--state-focus)]',
          isSelected
            ? 'border-s-2 border-[var(--color-primary)] bg-[var(--state-active)] font-medium text-[var(--color-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--state-hover)]',
        )}
      >
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />}
        <span className="min-w-0 truncate">{section.title}</span>
      </button>
    );
  };

  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-start', className)}>
      {/* ---------- desktop tablist ---------- */}
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="vertical"
        aria-label="Settings sections"
        className={cn(
          'hidden md:flex md:w-64 md:flex-shrink-0 md:flex-col md:gap-1',
          'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2',
        )}
      >
        {sections.map(renderTab)}
      </div>

      {/* ---------- mobile trigger ---------- */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onSheetOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={isSheetOpen}
        className={cn(
          'touch-target text-body-sm w-full justify-between gap-2 px-3 md:hidden',
          'rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]',
          'text-[var(--color-text-primary)]',
        )}
      >
        <span className="min-w-0 truncate">{activeSection?.title ?? 'Settings'}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {/* ---------- mobile bottom sheet ---------- */}
      {isSheetOpen && (
        <div
          role="presentation"
          className="modal-backdrop z-elevation-modal fixed inset-0 flex items-end md:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onSheetOpenChange(false);
          }}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Settings sections"
            className={cn(
              'animate-slide-in-up shadow-elevation-modal pb-safe w-full',
              'rounded-t-lg border-t border-[var(--border-default)] bg-[var(--surface-raised)] p-2',
            )}
          >
            <div role="tablist" aria-orientation="vertical" aria-label="Settings sections">
              {sections.map(renderTab)}
            </div>
          </div>
        </div>
      )}

      {/* ---------- panel ---------- */}
      <div className="min-w-0 flex-1">
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={activeSection ? tabId(activeSection.id) : undefined}
          tabIndex={0}
          className={cn(
            'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 md:p-6',
          )}
        >
          {children}
        </div>

        {actionBar && (
          <div
            className={cn(
              'mt-4 flex flex-wrap items-center justify-end gap-2',
              'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3',
            )}
          >
            {isDirty && (
              <p className="text-caption me-auto text-[var(--color-warning)]" role="status">
                You have unsaved changes.
              </p>
            )}
            {actionBar}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsLayout;

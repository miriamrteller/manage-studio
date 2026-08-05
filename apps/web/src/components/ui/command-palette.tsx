import React, { useEffect, useMemo, useRef } from 'react';
import { Command } from 'cmdk';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  /** Extra search terms — e.g. Hebrew aliases for an English label. */
  keywords?: string[];
  group?: string;
  disabled?: boolean;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  emptyMessage?: string;
  /** Accessible name for the dialog. */
  label?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * command-palette: global ⌘K / Ctrl+K launcher built on cmdk.
 *
 * Design system
 * - Panel uses `--surface-raised` (an elevated panel), not `--surface-overlay`,
 *   which in this codebase is the modal scrim colour `rgba(0,0,0,.5)`.
 * - The scrim reuses the existing `.modal-backdrop` class from
 *   DL-DESIGN-001 instead of a hard-coded translucent black.
 * - Layering uses the `.z-elevation-modal` tier utility.
 *
 * Accessibility
 * - role="dialog" + aria-modal + accessible name.
 * - Focus moves to the search input on open and returns to whatever was
 *   focused before, on close.
 * - Tab and Shift+Tab are trapped inside the panel; Escape closes it.
 * - Arrow keys / Enter come from cmdk, which also wires the listbox/option
 *   roles and aria-selected state.
 * - Background scroll is locked while open, so the page behind cannot drift.
 * - Group headings are exposed via cmdk's `heading`, styled in index.css.
 */
export function CommandPalette({
  open,
  onClose,
  items,
  placeholder = 'Search commands...',
  emptyMessage = 'No commands found.',
  label = 'Command palette',
}: CommandPaletteProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Stable group order: first-seen wins, so the palette does not reshuffle
  // itself between renders.
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of items) {
      const group = item.group || 'General';
      const bucket = map.get(group);
      if (bucket) bucket.push(item);
      else map.set(group, [item]);
    }
    return Array.from(map.entries());
  }, [items]);

  // Remember the trigger, focus the input, restore on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Lock background scroll while the palette owns the screen.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /**
   * Escape + focus trap are bound at the document level rather than as an
   * onKeyDown on the panel. That keeps the keys working even when focus has
   * briefly escaped the panel, and avoids attaching keyboard handlers to a
   * non-interactive container (which jsx-a11y rightly objects to).
   */
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // Decorative scrim: role="presentation" is accurate and keeps the
      // pointer-dismiss handler off a semantically meaningful element.
      role="presentation"
      className="modal-backdrop z-elevation-modal fixed inset-0 flex items-start justify-center pt-20"
      onMouseDown={(event) => {
        // Only a click on the scrim itself dismisses.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          'shadow-elevation-modal w-full max-w-lg rounded-lg',
          'border border-[var(--border-default)] bg-[var(--surface-raised)]',
        )}
      >
        <Command label={label} loop className="w-full">
          <Command.Input
            ref={inputRef}
            placeholder={placeholder}
            className={cn(
              'w-full border-0 border-b bg-transparent px-4 py-3',
              'border-[var(--border-subtle)] text-[var(--color-text-primary)]',
              'placeholder:text-[var(--color-text-muted)]',
              'focus:border-[var(--state-focus)] focus:outline-none',
            )}
          />

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-body-sm text-[var(--color-text-secondary)]">
              {emptyMessage}
            </Command.Empty>

            {groups.map(([group, groupItems]) => (
              <Command.Group key={group} heading={group}>
                {groupItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.description ?? ''}`}
                    keywords={item.keywords}
                    disabled={item.disabled}
                    onSelect={() => {
                      item.onSelect();
                      onClose();
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2',
                      'text-[var(--color-text-primary)]',
                      'hover:bg-[var(--state-hover)]',
                      'data-[selected=true]:bg-[var(--state-hover)]',
                      'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50',
                    )}
                  >
                    {item.icon && (
                      <span className="flex-shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium">{item.label}</span>
                      {item.description && (
                        <span className="block truncate text-caption text-[var(--color-text-secondary)]">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;

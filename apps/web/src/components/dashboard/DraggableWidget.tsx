import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';

export type DashboardWidgetType = 'kpi' | 'chart' | 'table' | 'calendar';

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  /** Grid column span at the md breakpoint and up. */
  span: 1 | 2 | 3;
  data: unknown;
}

export interface DraggableWidgetProps {
  widget: DashboardWidget;
  /** Zero-based position in the current order. */
  index: number;
  total: number;
  isEditing: boolean;
  /** True while this widget is "picked up" in keyboard drag mode. */
  isGrabbed: boolean;
  isDropTarget?: boolean;
  isInvalidTarget?: boolean;
  onGrabToggle: (id: string) => void;
  /** Reposition the grabbed widget by `delta` places. */
  onMove: (delta: -1 | 1) => void;
  /** Move focus by `delta` places without reordering. */
  onFocusMove: (delta: -1 | 1) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRemove?: (id: string) => void;
  onPointerDragStart?: (id: string) => void;
  onPointerDragEnter?: (id: string) => void;
  onPointerDragEnd?: () => void;
  children?: React.ReactNode;
}

/** md:col-span-* must be literal for Tailwind's content scanner to emit them. */
const SPAN_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
};

/**
 * DraggableWidget: a single dashboard tile that can be reordered with the
 * keyboard or the mouse. No external grid/DnD dependency — deliberate, per the
 * spec's "Dashboard Layout Decision": persistence is stable widget *order*, not
 * a brittle pixel grid, and owning the interaction keeps RTL behaviour correct.
 *
 * Interaction model
 * - Every keyboard interaction lives on a real <button> drag handle, never on
 *   the tile container. That gives a visible, discoverable affordance, a proper
 *   role and accessible name, and it keeps keyboard handlers off a
 *   non-interactive element.
 * - Space or Enter on the handle picks the widget up / puts it down.
 * - While grabbed, arrows reposition it; Enter confirms; Escape cancels and
 *   restores the pre-grab order.
 * - While not grabbed, arrows move focus to the neighbouring widget's handle.
 * - Delete/Backspace removes the widget when a handler is supplied.
 * - Arrow direction is mirrored under RTL, so "next" always means "further
 *   along the reading order".
 * - Mouse users get native HTML5 drag and drop on the tile.
 *
 * Design system
 * - `--surface-base` / `--border-subtle` at rest, a dashed `--color-primary`
 *   insertion indicator for the pending drop position, `--elevation-floating`
 *   while grabbed, and `--state-disabled` styling for invalid targets.
 *
 * Motion
 * - The lift uses `transform: translate3d()` behind a `motion-safe` transition;
 *   the global reduced-motion guard in index.css collapses it, so those users
 *   see immediate position swaps.
 */
export function DraggableWidget({
  widget,
  index,
  total,
  isEditing,
  isGrabbed,
  isDropTarget = false,
  isInvalidTarget = false,
  onGrabToggle,
  onMove,
  onFocusMove,
  onCommit,
  onCancel,
  onRemove,
  onPointerDragStart,
  onPointerDragEnter,
  onPointerDragEnd,
  children,
}: DraggableWidgetProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const isRtl =
        typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

      const forward: -1 | 1 = 1;
      const backward: -1 | 1 = -1;
      let delta: -1 | 1 | null = null;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          // Enter is handled natively by the button (click -> onGrabToggle);
          // Space is intercepted so the page cannot scroll.
          event.preventDefault();
          onGrabToggle(widget.id);
          return;
        case 'Escape':
          if (isGrabbed) {
            event.preventDefault();
            onCancel();
          }
          return;
        case 'Delete':
        case 'Backspace':
          if (onRemove && !isGrabbed) {
            event.preventDefault();
            onRemove(widget.id);
          }
          return;
        case 'ArrowRight':
          delta = isRtl ? backward : forward;
          break;
        case 'ArrowLeft':
          delta = isRtl ? forward : backward;
          break;
        case 'ArrowDown':
          delta = forward;
          break;
        case 'ArrowUp':
          delta = backward;
          break;
        default:
          return;
      }

      event.preventDefault();
      if (isGrabbed) onMove(delta);
      else onFocusMove(delta);
    },
    [isGrabbed, onCancel, onFocusMove, onGrabToggle, onMove, onRemove, widget.id],
  );

  const handleClick = useCallback(() => {
    if (isGrabbed) onCommit();
    else onGrabToggle(widget.id);
  }, [isGrabbed, onCommit, onGrabToggle, widget.id]);

  return (
    <section
      data-widget-id={widget.id}
      data-widget-index={index}
      data-grabbed={isEditing ? String(isGrabbed) : undefined}
      aria-labelledby={`widget-title-${widget.id}`}
      aria-roledescription={isEditing ? 'reorderable dashboard widget' : undefined}
      draggable={isEditing}
      onDragStart={() => onPointerDragStart?.(widget.id)}
      onDragEnter={() => onPointerDragEnter?.(widget.id)}
      onDragOver={(event) => {
        if (isEditing) event.preventDefault();
      }}
      onDragEnd={() => onPointerDragEnd?.()}
      onDrop={(event) => {
        if (!isEditing) return;
        event.preventDefault();
        onPointerDragEnd?.();
      }}
      style={{
        // translate3d keeps the lift on the compositor instead of triggering layout.
        transform: isGrabbed ? 'translate3d(0, -2px, 0)' : undefined,
      }}
      className={cn(
        SPAN_CLASSES[widget.span],
        'rounded-lg border bg-[var(--surface-base)] p-4',
        'motion-safe transition-shadow duration-150',
        isEditing && 'cursor-grab',
        isGrabbed
          ? 'shadow-elevation-floating cursor-grabbing border-[var(--color-primary)]'
          : 'elevation-1 border-[var(--border-subtle)]',
        isDropTarget && !isInvalidTarget && 'border-2 border-dashed border-[var(--color-primary)]',
        isInvalidTarget && 'border-[var(--state-disabled)] opacity-50',
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3
          id={`widget-title-${widget.id}`}
          className="min-w-0 truncate text-body-sm font-medium text-[var(--color-text-primary)]"
        >
          {widget.title}
        </h3>

        {isEditing && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <span className="text-caption text-[var(--color-text-secondary)]">
              {index + 1} / {total}
            </span>

            <button
              type="button"
              data-widget-handle={widget.id}
              aria-pressed={isGrabbed}
              aria-label={
                isGrabbed
                  ? `${widget.title}, picked up, position ${index + 1} of ${total}. Use the arrow keys to move it, Enter to confirm, Escape to cancel.`
                  : `Reorder ${widget.title}, position ${index + 1} of ${total}. Press Space to pick it up.`
              }
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              className={cn(
                'touch-target rounded-sm text-[var(--color-text-secondary)]',
                'hover:bg-[var(--state-hover)]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--state-focus)]',
                isGrabbed && 'bg-[var(--state-active)] text-[var(--color-primary)]',
              )}
            >
              {/* Decorative grip glyph; the accessible name lives on the button. */}
              <span aria-hidden="true">⠿</span>
            </button>
          </div>
        )}
      </header>

      {children}
    </section>
  );
}

export default DraggableWidget;

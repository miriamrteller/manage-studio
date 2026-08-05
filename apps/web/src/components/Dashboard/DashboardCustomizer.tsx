import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DraggableWidget,
  type DashboardWidget,
} from '@/components/Dashboard/DraggableWidget';

export type { DashboardWidget };

export interface CustomizerProps {
  widgets: DashboardWidget[];
  /** Called with the committed order whenever it changes. */
  onReorder: (widgetIds: string[]) => void;
  isEditing: boolean;
  /** Scopes the persisted layout: `dashboard-layout-${tenantId}`. */
  tenantId?: string;
  onRemove?: (widgetId: string) => void;
  /** Renders a widget body. Falls back to a labelled placeholder. */
  renderWidget?: (widget: DashboardWidget) => React.ReactNode;
  className?: string;
}

const STORAGE_PREFIX = 'dashboard-layout-';
const SAVE_DEBOUNCE_MS = 300;

/** Order-only persistence: ids are stable, pixel grids are not. */
export function loadWidgetOrder(tenantId: string | undefined): string[] | null {
  if (!tenantId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tenantId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) return null;
    return parsed as string[];
  } catch {
    // Corrupted or unavailable storage: fall back to the default layout.
    return null;
  }
}

export function saveWidgetOrder(tenantId: string | undefined, order: string[]): void {
  if (!tenantId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tenantId}`, JSON.stringify(order));
  } catch {
    /* quota or private-mode failure must never break the dashboard */
  }
}

/**
 * Reconciles a persisted order against the widgets the app actually supplies:
 * known ids keep their saved position, unknown ids are dropped, and newly
 * added widgets are appended. Without this, shipping a new widget would leave
 * it invisible for every existing user.
 */
function reconcileOrder(widgets: DashboardWidget[], saved: string[] | null): string[] {
  const live = widgets.map((widget) => widget.id);
  if (!saved) return live;
  const liveSet = new Set(live);
  const ordered = saved.filter((id) => liveSet.has(id));
  const seen = new Set(ordered);
  return [...ordered, ...live.filter((id) => !seen.has(id))];
}

function move(order: string[], from: number, to: number): string[] {
  if (to < 0 || to >= order.length || from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * DashboardCustomizer: in-house, keyboard-first widget reordering.
 *
 * Why no library: the spec's "Dashboard Layout Decision" — this avoids another
 * dependency, keeps full control of RTL behaviour, and persists a stable widget
 * order rather than a brittle pixel-grid layout.
 *
 * Features
 * - Keyboard reorder: arrows move focus, Space picks up / puts down, arrows
 *   reposition while grabbed, Enter commits, Escape restores the pre-grab order.
 * - Mouse drag via native HTML5 DnD with a translate3d lift for feedback.
 * - Undo/redo stack over committed orders (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z).
 * - Delete removes the focused widget when `onRemove` is supplied.
 * - Debounced persistence to `dashboard-layout-${tenantId}`, with graceful
 *   fallback to the default order if storage is missing or corrupt.
 *
 * Accessibility
 * - A polite live region narrates pick up / move / drop / cancel / undo, so a
 *   screen-reader user always knows the current position ("3 of 6").
 * - Instructions are exposed once, in a visually hidden description associated
 *   with the grid, instead of being repeated on every tile.
 * - The grid is a labelled group; each widget is a section named by its title.
 */
export function DashboardCustomizer({
  widgets,
  onReorder,
  isEditing,
  tenantId,
  onRemove,
  renderWidget,
  className = '',
}: CustomizerProps) {
  const [order, setOrder] = useState<string[]>(() =>
    reconcileOrder(widgets, loadWidgetOrder(tenantId)),
  );
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const undoStack = useRef<string[][]>([]);
  const redoStack = useRef<string[][]>([]);
  /** Order captured when a widget is picked up, so Escape can restore it. */
  const preGrabOrder = useRef<string[] | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const byId = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);
  const orderedWidgets = useMemo(
    () => order.map((id) => byId.get(id)).filter((widget): widget is DashboardWidget => Boolean(widget)),
    [order, byId],
  );

  // Keep the local order in sync when the widget set itself changes.
  useEffect(() => {
    setOrder((current) => {
      const reconciled = reconcileOrder(widgets, current);
      return reconciled.join('\u0000') === current.join('\u0000') ? current : reconciled;
    });
  }, [widgets]);

  // Debounced persistence. Ordered ids only — never pixel geometry.
  useEffect(() => {
    if (!tenantId) return;
    const timer = setTimeout(() => saveWidgetOrder(tenantId, order), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [order, tenantId]);

  /** Focus lands on the widget's drag handle — the element that owns the keys. */
  const focusWidget = useCallback((widgetId: string) => {
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-widget-handle="${widgetId}"]`);
    node?.focus();
  }, []);

  const commitOrder = useCallback(
    (next: string[], previous: string[], message: string) => {
      if (next.join('\u0000') === previous.join('\u0000')) return;
      undoStack.current.push(previous);
      redoStack.current = [];
      setOrder(next);
      onReorder(next);
      setAnnouncement(message);
    },
    [onReorder],
  );

  /**
   * Pick up / put down. Note this reads `grabbedId` from state rather than using
   * a `setGrabbedId(current => ...)` updater: updaters must stay pure, and React
   * 18 StrictMode invokes them twice, which would double-announce and
   * double-commit every drop.
   */
  const handleGrabToggle = useCallback(
    (widgetId: string) => {
      const title = byId.get(widgetId)?.title ?? widgetId;

      if (grabbedId === widgetId) {
        const base = preGrabOrder.current;
        preGrabOrder.current = null;
        setGrabbedId(null);
        if (base) {
          commitOrder(
            order,
            base,
            `${title} dropped at position ${order.indexOf(widgetId) + 1} of ${order.length}.`,
          );
        }
        return;
      }

      preGrabOrder.current = order;
      setGrabbedId(widgetId);
      setAnnouncement(
        `${title} picked up. Position ${order.indexOf(widgetId) + 1} of ${order.length}. Use the arrow keys to move it, Enter to confirm, Escape to cancel.`,
      );
    },
    [grabbedId, order, byId, commitOrder],
  );

  const handleMove = useCallback(
    (widgetId: string, delta: -1 | 1) => {
      const from = order.indexOf(widgetId);
      const to = from + delta;
      if (to < 0 || to >= order.length) {
        setAnnouncement(`${byId.get(widgetId)?.title ?? widgetId} is already at the ${delta < 0 ? 'first' : 'last'} position.`);
        return;
      }
      const next = move(order, from, to);
      setOrder(next);
      setAnnouncement(`${byId.get(widgetId)?.title ?? widgetId} moved to position ${to + 1} of ${next.length}.`);
      // Focus travels with the widget, which the browser would otherwise drop.
      requestAnimationFrame(() => focusWidget(widgetId));
    },
    [order, byId, focusWidget],
  );

  const handleFocusMove = useCallback(
    (widgetId: string, delta: -1 | 1) => {
      const target = order[order.indexOf(widgetId) + delta];
      if (target) focusWidget(target);
    },
    [order, focusWidget],
  );

  const handleCommit = useCallback(() => {
    if (!grabbedId) return;
    const base = preGrabOrder.current;
    preGrabOrder.current = null;
    const position = order.indexOf(grabbedId) + 1;
    if (base) {
      commitOrder(order, base, `${byId.get(grabbedId)?.title ?? grabbedId} placed at position ${position} of ${order.length}.`);
    }
    setGrabbedId(null);
  }, [grabbedId, order, byId, commitOrder]);

  const handleCancel = useCallback(() => {
    const base = preGrabOrder.current;
    const id = grabbedId;
    preGrabOrder.current = null;
    setGrabbedId(null);
    if (base) setOrder(base);
    setAnnouncement('Reordering cancelled. The original layout was restored.');
    if (id) requestAnimationFrame(() => focusWidget(id));
  }, [grabbedId, focusWidget]);

  /* ---- mouse drag (native HTML5 DnD) ---- */
  const dragSourceId = useRef<string | null>(null);
  /** Order captured at drag start, so the whole drag is one undo step. */
  const pointerDragBaseline = useRef<string[] | null>(null);

  const handlePointerDragStart = useCallback(
    (widgetId: string) => {
      dragSourceId.current = widgetId;
      pointerDragBaseline.current = order;
      preGrabOrder.current = null;
      setGrabbedId(widgetId);
    },
    [order],
  );

  const handlePointerDragEnter = useCallback((widgetId: string) => {
    const source = dragSourceId.current;
    if (!source || source === widgetId) return;
    setDropTargetId(widgetId);
    setOrder((current) => move(current, current.indexOf(source), current.indexOf(widgetId)));
  }, []);

  const handlePointerDragEnd = useCallback(() => {
    const source = dragSourceId.current;
    dragSourceId.current = null;
    setDropTargetId(null);
    setGrabbedId(null);
    const baseline = pointerDragBaseline.current;
    pointerDragBaseline.current = null;
    if (!source || !baseline) return;
    commitOrder(
      order,
      baseline,
      `${byId.get(source)?.title ?? source} dropped at position ${order.indexOf(source) + 1} of ${order.length}.`,
    );
  }, [order, byId, commitOrder]);

  /* ---- undo / redo ---- */
  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) {
      setAnnouncement('Nothing to undo.');
      return;
    }
    redoStack.current.push(order);
    setOrder(previous);
    onReorder(previous);
    setAnnouncement('Layout change undone.');
  }, [order, onReorder]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) {
      setAnnouncement('Nothing to redo.');
      return;
    }
    undoStack.current.push(order);
    setOrder(next);
    onReorder(next);
    setAnnouncement('Layout change redone.');
  }, [order, onReorder]);

  useEffect(() => {
    if (!isEditing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      if (!gridRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, undo, redo]);

  // Leaving edit mode must not leave a widget stuck in the grabbed state.
  useEffect(() => {
    if (!isEditing) {
      setGrabbedId(null);
      setDropTargetId(null);
      preGrabOrder.current = null;
    }
  }, [isEditing]);

  const instructionsId = 'dashboard-customizer-instructions';

  return (
    <div className={className}>
      {/* Single source of keyboard instructions, referenced by the grid. */}
      <p id={instructionsId} className="sr-only">
        Dashboard layout. Use the arrow keys to move between widgets. Press Space to pick a widget
        up, the arrow keys to reposition it, Enter to confirm and Escape to cancel. Press Delete to
        remove a widget. Press Control or Command plus Z to undo.
      </p>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="dashboard-customizer-status"
      >
        {announcement}
      </div>

      <div
        ref={gridRef}
        role="group"
        aria-label="Dashboard widgets"
        aria-describedby={isEditing ? instructionsId : undefined}
        className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', isEditing && 'rounded-lg')}
      >
        {orderedWidgets.map((widget, index) => (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            index={index}
            total={orderedWidgets.length}
            isEditing={isEditing}
            isGrabbed={grabbedId === widget.id}
            isDropTarget={dropTargetId === widget.id}
            onGrabToggle={handleGrabToggle}
            onMove={(delta) => handleMove(widget.id, delta)}
            onFocusMove={(delta) => handleFocusMove(widget.id, delta)}
            onCommit={handleCommit}
            onCancel={handleCancel}
            onRemove={onRemove}
            onPointerDragStart={handlePointerDragStart}
            onPointerDragEnter={handlePointerDragEnter}
            onPointerDragEnd={handlePointerDragEnd}
          >
            {renderWidget ? (
              renderWidget(widget)
            ) : (
              <p className="text-body-sm text-[var(--color-text-secondary)]">
                {widget.type} widget
              </p>
            )}
          </DraggableWidget>
        ))}
      </div>
    </div>
  );
}

export default DashboardCustomizer;

import React, { useCallback, useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

export interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /**
   * When true the whole row is the drag handle (default). When false, only the
   * element rendered from `renderHandle` starts a drag, which keeps interactive
   * content inside the row (links, buttons, inputs) usable.
   */
  dragWholeItem?: boolean;
  renderHandle?: (handleProps: {
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners: Record<string, unknown>;
  }) => React.ReactNode;
  /** Human-readable name used in the drag handle's accessible label. */
  label?: string;
}

/**
 * SortableItem: one reorderable row.
 *
 * Motion: dnd-kit's `transition` is applied through the CSS transform helper.
 * The global `prefers-reduced-motion` guard in index.css reduces transition
 * durations to ~0, so reduced-motion users get instant position swaps.
 *
 * Accessibility: the drag affordance is a real button-like element carrying
 * dnd-kit's `attributes` (role, tabIndex, aria-roledescription,
 * aria-describedby), so keyboard users can pick up and move rows.
 */
export function SortableItem({
  id,
  children,
  disabled = false,
  className,
  dragWholeItem = true,
  renderHandle,
  label,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? 'default' : 'grab',
  };

  const handleProps = {
    attributes: {
      ...(attributes as React.HTMLAttributes<HTMLElement>),
      'aria-label': label ? `Reorder ${label}` : 'Reorder item',
    },
    listeners: (listeners ?? {}) as Record<string, unknown>,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md',
        isDragging && 'z-elevation-drag shadow-elevation-overlay',
        disabled && 'opacity-50',
        className,
      )}
      {...(dragWholeItem && !renderHandle ? handleProps.attributes : null)}
      {...(dragWholeItem && !renderHandle ? listeners : null)}
    >
      {renderHandle ? (
        <>
          {renderHandle(handleProps)}
          {children}
        </>
      ) : (
        children
      )}
    </div>
  );
}

export interface SortableListProps {
  /** Ordered item ids. Must match the ids given to each SortableItem. */
  items: string[];
  onReorder: (activeId: string, overId: string) => void;
  children: React.ReactNode;
  /** Disables dragging for the whole list (e.g. while a save is in flight). */
  disabled?: boolean;
  /** Optional map of id -> readable name, used for live-region announcements. */
  labels?: Record<string, string>;
}

/**
 * SortableList: DndContext + SortableContext wrapper for a vertical list.
 *
 * NOTE: `SortableContext` has no `disabled` prop — the draft passed one, which
 * TypeScript rejects and which would have done nothing at runtime. Disabling is
 * applied per item instead (see `disabled` on `useSortable`), and this
 * component forwards its own `disabled` flag by dropping the sensors so no
 * drag can start.
 */
export function SortableList({
  items,
  onReorder,
  children,
  disabled = false,
  labels,
}: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = useCallback(
    (id: string | number) => labels?.[String(id)] ?? String(id),
    [labels],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorder(String(active.id), String(over.id));
    },
    [onReorder],
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) =>
        `Picked up ${nameOf(active.id)}. Position ${items.indexOf(String(active.id)) + 1} of ${items.length}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${nameOf(active.id)} moved to position ${items.indexOf(String(over.id)) + 1} of ${items.length}.`
          : `${nameOf(active.id)} is no longer over a drop position.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `${nameOf(active.id)} dropped at position ${items.indexOf(String(over.id)) + 1} of ${items.length}.`
          : `${nameOf(active.id)} returned to its original position.`,
      onDragCancel: ({ active }) =>
        `Reordering cancelled. ${nameOf(active.id)} returned to its original position.`,
    }),
    [items, nameOf],
  );

  return (
    <DndContext
      sensors={disabled ? [] : sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export default SortableList;

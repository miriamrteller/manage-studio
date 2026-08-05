import React, { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDndMonitor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

/**
 * Minimal structural types for the bits of the FullCalendar API this adapter
 * touches. Declared locally on purpose: it keeps the DnD layer decoupled from
 * @fullcalendar/* typings while still accepting a real `FullCalendar` ref by
 * structural compatibility.
 */
export interface CalendarEventLike {
  id: string;
  title?: string;
  revert?: () => void;
}

export interface CalendarApiLike {
  view: unknown;
  getEventById(id: string): { revert?: () => void } | null;
}

export interface CalendarInstanceLike {
  getApi(): CalendarApiLike;
}

/** Mirrors the payload FullCalendar hands to its own `eventDrop` callback. */
export interface CalendarEventDropInfo {
  event: CalendarEventLike;
  delta: { x: number; y: number };
  revert: () => void;
  jsEvent: Event | null;
  view: unknown;
}

export interface CalendarDragAdapterProps {
  calendarRef: React.RefObject<CalendarInstanceLike | null>;
  onEventDrop: (info: CalendarEventDropInfo) => void;
  children: React.ReactNode;
}

/**
 * Reads the event payload an external draggable attached to its dnd-kit data.
 * Convention: `useDraggable({ data: { event } })`.
 */
function readEvent(data: unknown): CalendarEventLike | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = (data as { event?: unknown }).event;
  if (!candidate || typeof candidate !== 'object') return null;
  const { id } = candidate as { id?: unknown };
  return typeof id === 'string' ? (candidate as CalendarEventLike) : null;
}

interface MonitorProps {
  onStart: (event: DragStartEvent) => void;
  onEnd: (event: DragEndEvent) => void;
  onCancel: () => void;
}

/**
 * `useDndMonitor` must be called from a component *inside* a DndContext — it
 * reads the context the provider creates. The draft called it in the same
 * component that renders the provider, where the context is not yet visible,
 * so the callbacks never fired. Splitting it into this child fixes that.
 */
function CalendarDragMonitor({ onStart, onEnd, onCancel }: MonitorProps) {
  useDndMonitor({
    onDragStart: onStart,
    onDragEnd: onEnd,
    onDragCancel: onCancel,
  });
  return null;
}

/**
 * CalendarDragAdapter: bridges @dnd-kit drags onto FullCalendar's native
 * `eventDrop` contract, so external items (unscheduled classes, waitlisted
 * students, ...) can be dropped onto the calendar without patching
 * FullCalendar or changing its public API.
 *
 * Accessibility
 * - A KeyboardSensor is registered alongside the PointerSensor, so a drag can
 *   be performed with Space/Enter + arrow keys.
 * - `announcements` push drag start / over / drop / cancel into dnd-kit's
 *   built-in live region, so the operation is narrated instead of silent.
 * - PointerSensor uses an 8px activation distance so a click on an event is
 *   still a click, not an accidental micro-drag.
 *
 * Motion: the overlay is a static token-styled chip with no transition, so it
 * is inherently safe under `prefers-reduced-motion`.
 */
export function CalendarDragAdapter({
  calendarRef,
  onEventDrop,
  children,
}: CalendarDragAdapterProps) {
  const [draggedEvent, setDraggedEvent] = useState<CalendarEventLike | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleStart = useCallback((event: DragStartEvent) => {
    setDraggedEvent(readEvent(event.active.data.current));
  }, []);

  const handleEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedEvent(null);

      const calendarInstance = calendarRef.current;
      if (!event.over || !calendarInstance) return;

      const dragged = readEvent(event.active.data.current);
      if (!dragged) return;

      const api = calendarInstance.getApi();

      onEventDrop({
        event: dragged,
        delta: event.delta,
        revert: () => {
          const existing = api.getEventById(dragged.id);
          existing?.revert?.();
        },
        jsEvent: (event.activatorEvent as Event | null) ?? null,
        view: api.view,
      });
    },
    [calendarRef, onEventDrop],
  );

  const handleCancel = useCallback(() => setDraggedEvent(null), []);

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `Picked up ${readEvent(active.data.current)?.title ?? 'event'}.`,
      onDragOver: ({ over }) =>
        over ? `Event is over calendar slot ${String(over.id)}.` : 'Event is not over a calendar slot.',
      onDragEnd: ({ over }) =>
        over
          ? `Event dropped on calendar slot ${String(over.id)}.`
          : 'Event dropped outside the calendar. No change was made.',
      onDragCancel: () => 'Drag cancelled. The event was returned to its original position.',
    }),
    [],
  );

  return (
    <DndContext sensors={sensors} accessibility={{ announcements }}>
      <CalendarDragMonitor onStart={handleStart} onEnd={handleEnd} onCancel={handleCancel} />
      {children}
      <DragOverlay>
        {draggedEvent && (
          <div
            className={
              'shadow-elevation-overlay rounded px-3 py-1 text-body-sm ' +
              'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
            }
          >
            {draggedEvent.title ?? draggedEvent.id}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default CalendarDragAdapter;

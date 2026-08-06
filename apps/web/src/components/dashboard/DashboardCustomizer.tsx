import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export interface DashboardWidget {
  id: string;
  title: string;
  span: 1 | 2 | 3;
  visible: boolean;
}

export interface DraggableWidgetProps {
  widget: DashboardWidget;
  isEditing: boolean;
  children: React.ReactNode;
}

export function DraggableWidget({
  widget,
  isEditing,
  children,
}: DraggableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        rounded-lg bg-[--surface-raised] border border-[--border-default]
        ${isDragging ? 'shadow-lg ring-2 ring-[--color-primary]' : ''}
        ${isEditing ? 'cursor-move' : ''}
      `}
      {...attributes}
    >
      {isEditing && (
        <div
          {...listeners}
          className="absolute top-2 left-2 rtl:left-auto rtl:right-2 z-10 p-1.5 rounded-md bg-[--surface-default] hover:bg-[--surface-hover] cursor-grab active:cursor-grabbing text-[--text-muted] hover:text-[--text-primary] transition-colors"
          aria-label={`Drag to reorder ${widget.title}`}
          role="button"
          tabIndex={0}
        >
          <GripVertical size={16} />
        </div>
      )}
      <div className={isEditing ? 'pl-10 rtl:pl-0 rtl:pr-10' : ''}>
        {children}
      </div>
    </div>
  );
}

export interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  tenantId: string;
  onReorder: (ids: string[]) => void;
  isEditing: boolean;
}

function getStorageKey(tenantId: string): string {
  return `dashboard-layout-${tenantId}`;
}

export function DashboardCustomizer({
  widgets,
  tenantId,
  onReorder,
  isEditing,
}: DashboardCustomizerProps) {
  const [orderedWidgets, setOrderedWidgets] = useState<DashboardWidget[]>(widgets);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load saved order from localStorage on mount
  useEffect(() => {
    const storageKey = getStorageKey(tenantId);
    const savedOrder = localStorage.getItem(storageKey);

    if (savedOrder) {
      try {
        const savedIds: string[] = JSON.parse(savedOrder);
        const widgetMap = new Map(widgets.map((w) => [w.id, w]));
        
        // Reorder widgets based on saved order, keeping any new widgets at the end
        const reordered: DashboardWidget[] = [];
        const usedIds = new Set<string>();

        for (const id of savedIds) {
          const widget = widgetMap.get(id);
          if (widget) {
            reordered.push(widget);
            usedIds.add(id);
          }
        }

        // Add any widgets that weren't in saved order
        for (const widget of widgets) {
          if (!usedIds.has(widget.id)) {
            reordered.push(widget);
          }
        }

        setOrderedWidgets(reordered);
      } catch {
        setOrderedWidgets(widgets);
      }
    } else {
      setOrderedWidgets(widgets);
    }
  }, [tenantId, widgets]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    const widget = orderedWidgets.find((w) => w.id === active.id);
    if (widget) {
      setAnnouncement(`Picked up ${widget.title}. Use arrow keys to move.`);
    }
  }, [orderedWidgets]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setOrderedWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        const newIds = newItems.map((item) => item.id);

        // Save to localStorage
        const storageKey = getStorageKey(tenantId);
        localStorage.setItem(storageKey, JSON.stringify(newIds));

        // Notify parent
        onReorder(newIds);

        // Announce the change
        const movedWidget = items[oldIndex];
        setAnnouncement(
          `${movedWidget.title} moved from position ${oldIndex + 1} to position ${newIndex + 1}`
        );

        return newItems;
      });
    } else {
      const widget = orderedWidgets.find((w) => w.id === active.id);
      if (widget) {
        setAnnouncement(`${widget.title} dropped in original position.`);
      }
    }
  }, [tenantId, onReorder, orderedWidgets]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setAnnouncement('Drag cancelled.');
  }, []);

  const activeWidget = activeId
    ? orderedWidgets.find((w) => w.id === activeId)
    : null;

  const visibleWidgets = orderedWidgets.filter((w) => w.visible);

  return (
    <>
      {/* Screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={visibleWidgets.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            role="list"
            aria-label="Dashboard widgets"
          >
            {visibleWidgets.map((widget) => (
              <div
                key={widget.id}
                role="listitem"
                className={`
                  ${widget.span === 2 ? 'md:col-span-2' : ''}
                  ${widget.span === 3 ? 'md:col-span-2 lg:col-span-3' : ''}
                `}
              >
                <DraggableWidget widget={widget} isEditing={isEditing}>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-[--text-primary]">
                      {widget.title}
                    </h3>
                    <div className="mt-2 text-[--text-secondary]">
                      {/* Widget content would go here */}
                      <p className="text-sm">Widget content placeholder</p>
                    </div>
                  </div>
                </DraggableWidget>
              </div>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeWidget ? (
            <div className="rounded-lg bg-[--surface-raised] border-2 border-[--color-primary] shadow-xl opacity-90 p-4">
              <h3 className="text-lg font-semibold text-[--text-primary]">
                {activeWidget.title}
              </h3>
              <div className="mt-2 text-[--text-secondary]">
                <p className="text-sm">Widget content placeholder</p>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

export default DashboardCustomizer;

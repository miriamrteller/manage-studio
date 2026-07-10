import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core';
import heLocale from '@fullcalendar/core/locales/he';
import { Modal } from '@/components/ui/modal';
import { ClassCard } from '@/components/shared';
import { useTenant } from '@/hooks/useTenant';
import type { PublicOffering } from '@/schemas';
import { usePublicScheduleEvents } from '../hooks/usePublicScheduleEvents';
import { useNextEventDate } from '../hooks/useNextEventDate';
import { useFitViewportHeight } from '../hooks/useFitViewportHeight';
import { SCHEDULE_EVENT_COLORS } from '../types';

// Hoisted to module scope so their references are stable across renders.
// Passing fresh objects/arrays makes FullCalendar reprocess options and re-fire
// datesSet on every render, which can trigger an infinite update loop.
const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin];
const CALENDAR_LOCALES = [heLocale];
const HEADER_TOOLBAR = {
  start: 'prev,next today',
  center: 'title',
  end: 'dayGridMonth,timeGridWeek,timeGridDay',
} as const;

interface PublicScheduleCalendarProps {
  /** Public offerings already fetched for the list view; used to resolve the popover details. */
  offerings: PublicOffering[];
}

/**
 * Client-facing timetable (FullCalendar) over public, active classes and sessions.
 * Read-only: no blocked time, no appointments. Clicking an event opens a details
 * popover with the matching class card (including its Enrol action).
 * Hebrew locale + RTL by default. All times are Asia/Jerusalem.
 */
export function PublicScheduleCalendar({ offerings }: PublicScheduleCalendarProps) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const calendarRef = useRef<FullCalendar>(null);
  const didAutoNavigate = useRef(false);
  const { ref: fitRef, height } = useFitViewportHeight<HTMLDivElement>();
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(null);
  const { data: events = [], isLoading } = usePublicScheduleEvents(range);
  const { data: nextEventDate } = useNextEventDate({ source: 'public', subdomain: tenant?.subdomain });

  const isRtl = i18n.language !== 'en';

  // Open on the month containing the next upcoming class (once, on first load).
  useEffect(() => {
    if (nextEventDate && !didAutoNavigate.current && calendarRef.current) {
      didAutoNavigate.current = true;
      calendarRef.current.getApi().gotoDate(nextEventDate);
    }
  }, [nextEventDate]);

  const offeringsById = useMemo(() => {
    const map = new Map<string, PublicOffering>();
    for (const o of offerings) map.set(o.id, o);
    return map;
  }, [offerings]);

  const calendarEvents = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.starts_at,
        end: e.ends_at,
        backgroundColor: SCHEDULE_EVENT_COLORS[e.event_type],
        borderColor: SCHEDULE_EVENT_COLORS[e.event_type],
        extendedProps: { offering_id: e.offering_id ?? null },
      })),
    [events],
  );

  const selectedOffering = selectedOfferingId ? offeringsById.get(selectedOfferingId) ?? null : null;

  function handleDatesSet(arg: DatesSetArg) {
    // Only update when the window actually changed. FullCalendar fires datesSet
    // on every render; setting a new object each time causes an infinite loop.
    setRange((prev) =>
      prev && prev.start.getTime() === arg.start.getTime() && prev.end.getTime() === arg.end.getTime()
        ? prev
        : { start: arg.start, end: arg.end },
    );
  }

  function handleEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as { offering_id: string | null };
    if (props.offering_id) setSelectedOfferingId(props.offering_id);
  }

  return (
    <div ref={fitRef} className="relative" style={{ height }} aria-busy={isLoading}>
      <FullCalendar
        ref={calendarRef}
        plugins={CALENDAR_PLUGINS}
        initialView="dayGridMonth"
        locales={CALENDAR_LOCALES}
        locale={i18n.language === 'en' ? 'en' : 'he'}
        direction={isRtl ? 'rtl' : 'ltr'}
        timeZone="Asia/Jerusalem"
        headerToolbar={HEADER_TOOLBAR}
        height="100%"
        expandRows
        nowIndicator
        events={calendarEvents}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
      />

      <Modal
        isOpen={!!selectedOffering}
        title={selectedOffering?.name ?? t('pages.classes.class_details')}
        onClose={() => setSelectedOfferingId(null)}
      >
        {selectedOffering && (
          <ClassCard class={selectedOffering} currency={tenant?.currency || 'ILS'} />
        )}
      </Modal>
    </div>
  );
}

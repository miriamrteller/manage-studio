import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import heLocale from '@fullcalendar/core/locales/he';
import { useTenant } from '@/hooks/useTenant';
import { useScheduleEvents } from '../hooks/useScheduleEvents';
import { useNextEventDate } from '../hooks/useNextEventDate';
import { useFitViewportHeight } from '../hooks/useFitViewportHeight';
import { makeDayCellContent, renderDayHeaderContent, shadedDayClassNames } from './calendarContent';
import { createScheduleColorResolver } from '../lib/eventColors';
import { type ScheduleEvent } from '../types';

// Hoisted to module scope so their references are stable across renders.
// Passing fresh objects/arrays makes FullCalendar reprocess options and re-fire
// datesSet on every render, which can trigger an infinite update loop.
const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const CALENDAR_LOCALES = [heLocale];

interface ScheduleCalendarProps {
  /** Called when the user selects an empty range to block time. */
  onCreateBlock?: (range: { start: Date; end: Date }) => void;
  /** Called when the user clicks an event to open a detail panel. */
  onEventClick?: (event: ScheduleEvent) => void;
}

/**
 * Read-only timetable (FullCalendar) over classes, sessions, appointments, and
 * blocked time. Hebrew locale + RTL by default. All times are Asia/Jerusalem.
 */
export function ScheduleCalendar({ onCreateBlock, onEventClick }: ScheduleCalendarProps) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const calendarRef = useRef<FullCalendar>(null);
  const didAutoNavigate = useRef(false);
  const { ref: fitRef, height } = useFitViewportHeight<HTMLDivElement>();
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  // Whole month at a glance by default (busy days collapse to "+N more"); the
  // toolbar toggle expands to show every event (which may scroll the page).
  const [fitToScreen, setFitToScreen] = useState(true);
  const { data: events = [], isLoading } = useScheduleEvents(range);
  const { data: nextEventDate } = useNextEventDate({ source: 'admin', tenant });
  // Latest next-event date, read lazily by the toolbar button click handler so the
  // button config can stay stable across data refetches.
  const nextEventDateRef = useRef<Date | null>(null);
  nextEventDateRef.current = nextEventDate ?? null;

  const isRtl = i18n.language !== 'en';

  // Open on the month containing the next upcoming event (once, on first load).
  useEffect(() => {
    if (nextEventDate && !didAutoNavigate.current && calendarRef.current) {
      didAutoNavigate.current = true;
      calendarRef.current.getApi().gotoDate(nextEventDate);
    }
  }, [nextEventDate]);

  const resolveColor = useMemo(() => createScheduleColorResolver(events), [events]);
  const dayCellContent = useMemo(() => makeDayCellContent(i18n.language), [i18n.language]);

  // "Next event" jumps to the month of the next upcoming event (handler reads the
  // latest date via ref). "Fit"/"Show all" toggles whether busy days collapse.
  const customButtons = useMemo(
    () => ({
      nextEvent: {
        text: t('scheduling.calendar.next_event'),
        click: () => {
          const d = nextEventDateRef.current;
          if (d && calendarRef.current) calendarRef.current.getApi().gotoDate(d);
        },
      },
      fitToggle: {
        text: fitToScreen
          ? t('scheduling.calendar.show_all_events')
          : t('scheduling.calendar.fit_to_screen'),
        click: () => setFitToScreen((v) => !v),
      },
    }),
    [t, fitToScreen],
  );

  // Only surface the next-event button when there is an upcoming event to jump to.
  const headerToolbar = useMemo(
    () => ({
      start: nextEventDate ? 'prev,next today nextEvent' : 'prev,next today',
      center: 'title',
      end: 'fitToggle dayGridMonth,timeGridWeek,timeGridDay',
    }),
    [nextEventDate],
  );

  const calendarEvents = useMemo(
    () =>
      events.map((e) => {
        const color = resolveColor(e);
        return {
          id: e.id,
          title: e.title,
          start: e.starts_at,
          end: e.ends_at,
          backgroundColor: color.background,
          borderColor: color.border,
          textColor: color.text,
          extendedProps: {
            event_type: e.event_type,
            ref_id: e.ref_id ?? null,
            offering_id: e.offering_id ?? null,
          },
        };
      }),
    [events, resolveColor],
  );

  function handleDatesSet(arg: DatesSetArg) {
    // Only update when the window actually changed. FullCalendar fires datesSet
    // on every render; setting a new object each time causes an infinite loop.
    setRange((prev) =>
      prev && prev.start.getTime() === arg.start.getTime() && prev.end.getTime() === arg.end.getTime()
        ? prev
        : { start: arg.start, end: arg.end },
    );
  }

  function handleSelect(arg: DateSelectArg) {
    onCreateBlock?.({ start: arg.start, end: arg.end });
  }

  function handleEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as {
      event_type: ScheduleEvent['event_type'];
      ref_id: string | null;
      offering_id: string | null;
    };
    onEventClick?.({
      id: arg.event.id,
      title: arg.event.title,
      starts_at: arg.event.startStr,
      ends_at: arg.event.endStr,
      event_type: props.event_type,
      ref_id: props.ref_id,
      offering_id: props.offering_id,
    });
  }

  return (
    <div
      ref={fitRef}
      className={`relative${fitToScreen ? ' fc-daycell-scroll' : ''}`}
      style={{ height: fitToScreen ? height : undefined }}
      aria-busy={isLoading}
    >
      <FullCalendar
        ref={calendarRef}
        plugins={CALENDAR_PLUGINS}
        initialView="dayGridMonth"
        locales={CALENDAR_LOCALES}
        locale={i18n.language === 'en' ? 'en' : 'he'}
        direction={isRtl ? 'rtl' : 'ltr'}
        timeZone="Asia/Jerusalem"
        headerToolbar={headerToolbar}
        customButtons={customButtons}
        height={fitToScreen ? '100%' : 'auto'}
        expandRows={fitToScreen}
        dayMaxEvents={false}
        nowIndicator
        eventDisplay="block"
        dayCellContent={dayCellContent}
        dayCellClassNames={shadedDayClassNames}
        dayHeaderContent={renderDayHeaderContent}
        selectable={!!onCreateBlock}
        selectMirror
        events={calendarEvents}
        datesSet={handleDatesSet}
        select={handleSelect}
        eventClick={handleEventClick}
      />
    </div>
  );
}

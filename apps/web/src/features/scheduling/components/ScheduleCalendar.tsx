import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import heLocale from '@fullcalendar/core/locales/he';
import { useScheduleEvents } from '../hooks/useScheduleEvents';
import { SCHEDULE_EVENT_COLORS, type ScheduleEvent } from '../types';

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
  const { i18n } = useTranslation();
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const { data: events = [], isLoading } = useScheduleEvents(range);

  const isRtl = i18n.language !== 'en';

  const calendarEvents = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.starts_at,
        end: e.ends_at,
        backgroundColor: SCHEDULE_EVENT_COLORS[e.event_type],
        borderColor: SCHEDULE_EVENT_COLORS[e.event_type],
        extendedProps: {
          event_type: e.event_type,
          ref_id: e.ref_id ?? null,
          offering_id: e.offering_id ?? null,
        },
      })),
    [events],
  );

  function handleDatesSet(arg: DatesSetArg) {
    setRange({ start: arg.start, end: arg.end });
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
    <div className="relative" aria-busy={isLoading}>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        locales={[heLocale]}
        locale={i18n.language === 'en' ? 'en' : 'he'}
        direction={isRtl ? 'rtl' : 'ltr'}
        timeZone="Asia/Jerusalem"
        headerToolbar={{
          start: 'prev,next today',
          center: 'title',
          end: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        height="auto"
        nowIndicator
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

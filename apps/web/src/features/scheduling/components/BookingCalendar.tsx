import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type {
  CalendarApi,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
} from '@fullcalendar/core';
import heLocale from '@fullcalendar/core/locales/he';
import { cn } from '@/lib/utils';
import { useAvailableSlots } from '../hooks/useAvailableSlots';
import { useFitViewportHeight } from '../hooks/useFitViewportHeight';
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport';
import { useNextAvailableSlot } from '../hooks/useNextAvailableSlot';
import { makeDayCellContent, renderDayHeaderContent, shadedDayClassNames } from './calendarContent';
import type { AvailableSlot } from '../bookingService';

const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const CALENDAR_LOCALES = [heLocale];

function jerusalemDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayHeading(isoDate: string, language: string): string {
  // Noon UTC avoids DST edge cases when formatting a calendar date.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString(language === 'en' ? 'en-GB' : 'he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Hours/minutes in Asia/Jerusalem for FullCalendar scrollToTime. */
function jerusalemTimeParts(iso: string): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  let hours = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minutes = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  // en-GB can yield 24:00 for midnight in some engines.
  if (hours === 24) hours = 0;
  return { hours, minutes };
}

function toScrollTime(iso: string, leadMinutes = 30): string {
  const { hours, minutes } = jerusalemTimeParts(iso);
  const total = Math.max(0, hours * 60 + minutes - leadMinutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/** Jump to the slot's date; scroll time axis only if already on a time-grid view. */
function goToSlot(api: CalendarApi, slot: AvailableSlot) {
  api.gotoDate(slot.starts_at);
  if (!api.view.type.startsWith('timeGrid')) return;
  const scrollTime = toScrollTime(slot.starts_at, 30);
  const scroll = () => api.scrollToTime(scrollTime);
  scroll();
  requestAnimationFrame(scroll);
  window.setTimeout(scroll, 100);
  window.setTimeout(scroll, 300);
}

/** Visible time-grid window padded around a day's slots so they aren't off-screen. */
function timeWindowForSlots(daySlots: AvailableSlot[]): { min: string; max: string } {
  if (daySlots.length === 0) {
    return { min: '07:00:00', max: '21:00:00' };
  }
  const first = jerusalemTimeParts(daySlots[0].starts_at);
  const last = jerusalemTimeParts(daySlots[daySlots.length - 1].ends_at);
  const minHour = Math.max(0, first.hours - 1);
  const maxHour = Math.min(24, Math.max(minHour + 4, last.hours + (last.minutes > 0 ? 2 : 1)));
  return {
    min: `${String(minHour).padStart(2, '0')}:00:00`,
    max: `${String(maxHour).padStart(2, '0')}:00:00`,
  };
}

export interface BookingCalendarProps {
  subdomain: string;
  offeringId: string;
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
}

/**
 * Client booking timetable: FullCalendar shows where slots sit; a button grid under
 * the calendar is the primary way to pick a time. Starts on month view; if the user
 * switches to week/day, FullCalendar keeps that until refresh. Hebrew + RTL;
 * times are Asia/Jerusalem.
 */
export function BookingCalendar({
  subdomain,
  offeringId,
  selectedSlot,
  onSelectSlot,
}: BookingCalendarProps) {
  const { t, i18n } = useTranslation();
  const calendarRef = useRef<FullCalendar>(null);
  const isNarrow = useIsNarrowViewport();
  const { ref: fitRef, height } = useFitViewportHeight<HTMLDivElement>(
    isNarrow ? 420 : 560,
    isNarrow ? 200 : 220,
  );
  const [range, setRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [activeDate, setActiveDate] = useState<string>(() => jerusalemDate(new Date()));
  const [fitToScreen, setFitToScreen] = useState(true);
  const nextSlotRef = useRef<AvailableSlot | null>(null);
  const didAutoNavigate = useRef(false);

  const {
    data: nextSlot = null,
    isLoading: nextSlotLoading,
    isFetched: nextSlotFetched,
    isError: nextSlotError,
    refetch: refetchNextSlot,
  } = useNextAvailableSlot(subdomain, offeringId);
  nextSlotRef.current = nextSlot;

  const {
    data: slots = [],
    isLoading,
    isFetching,
    isError: slotsError,
    refetch: refetchSlots,
  } = useAvailableSlots(
    subdomain,
    offeringId,
    range,
  );

  useEffect(() => {
    didAutoNavigate.current = false;
  }, [offeringId]);

  useEffect(() => {
    if (!nextSlot) return;
    setActiveDate(jerusalemDate(new Date(nextSlot.starts_at)));
  }, [nextSlot, offeringId]);

  // Once: jump to the next available date (does not change month/week/day).
  useEffect(() => {
    if (!nextSlot || didAutoNavigate.current || !calendarRef.current) return;
    didAutoNavigate.current = true;
    goToSlot(calendarRef.current.getApi(), nextSlot);
  }, [nextSlot]);

  const daySlots = useMemo(
    () => slots.filter((s) => jerusalemDate(new Date(s.starts_at)) === activeDate),
    [slots, activeDate],
  );

  const timeWindow = useMemo(() => {
    if (daySlots.length > 0) return timeWindowForSlots(daySlots);
    if (nextSlot && jerusalemDate(new Date(nextSlot.starts_at)) === activeDate) {
      return timeWindowForSlots([nextSlot]);
    }
    return timeWindowForSlots([]);
  }, [daySlots, nextSlot, activeDate]);

  const initialScrollTime = useMemo(() => {
    if (nextSlot) return toScrollTime(nextSlot.starts_at, 30);
    return timeWindow.min;
  }, [nextSlot, timeWindow.min]);

  const isRtl = i18n.language !== 'en';
  const dayCellContent = useMemo(() => makeDayCellContent(i18n.language), [i18n.language]);
  const validRange = useMemo(() => ({ start: jerusalemDate(new Date()) }), []);

  const customButtons = useMemo(
    () => ({
      fitToggle: {
        text: fitToScreen
          ? t('pages.classes.show_all_events')
          : t('pages.classes.fit_to_screen'),
        click: () => setFitToScreen((v) => !v),
      },
      nextSlot: {
        text: t('scheduling.book.next_available_slot'),
        click: () => {
          const slot = nextSlotRef.current;
          if (!slot || !calendarRef.current) return;
          setActiveDate(jerusalemDate(new Date(slot.starts_at)));
          goToSlot(calendarRef.current.getApi(), slot);
        },
      },
    }),
    [t, fitToScreen],
  );

  const headerToolbar = useMemo(() => {
    const nav = nextSlot ? 'prev,next today nextSlot' : 'prev,next today';
    return {
      start: nav,
      center: 'title',
      end: isNarrow
        ? 'dayGridMonth,timeGridWeek,timeGridDay'
        : 'fitToggle dayGridMonth,timeGridWeek,timeGridDay',
    };
  }, [isNarrow, nextSlot]);

  const calendarEvents = useMemo(() => {
    const selectedKey = selectedSlot?.starts_at ?? null;
    return slots.map((s) => {
      const selected = s.starts_at === selectedKey;
      return {
        id: s.starts_at,
        title: formatSlotTime(s.starts_at),
        start: s.starts_at,
        end: s.ends_at,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: 'inherit',
        classNames: selected ? ['fc-booking-slot', 'fc-booking-slot-selected'] : ['fc-booking-slot'],
        extendedProps: { starts_at: s.starts_at, ends_at: s.ends_at, selected },
      };
    });
  }, [slots, selectedSlot]);

  function handleDatesSet(arg: DatesSetArg) {
    const startDate = jerusalemDate(arg.start);
    const lastInclusive = new Date(arg.end.getTime() - 1);
    const endDate = jerusalemDate(lastInclusive);
    setRange((prev) =>
      prev && prev.startDate === startDate && prev.endDate === endDate
        ? prev
        : { startDate, endDate },
    );

    if (arg.view.type === 'timeGridDay') {
      setActiveDate(jerusalemDate(arg.view.currentStart));
      return;
    }
    setActiveDate((prev) => {
      if (prev >= startDate && prev <= endDate) return prev;
      if (nextSlot) {
        const nextDay = jerusalemDate(new Date(nextSlot.starts_at));
        if (nextDay >= startDate && nextDay <= endDate) return nextDay;
      }
      const today = jerusalemDate(new Date());
      if (today >= startDate && today <= endDate) return today;
      return startDate;
    });
  }

  function handleDateClick(arg: DateClickArg) {
    setActiveDate(jerusalemDate(arg.date));
  }

  function handleEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as { starts_at: string; ends_at: string };
    setActiveDate(jerusalemDate(new Date(props.starts_at)));
    onSelectSlot({ starts_at: props.starts_at, ends_at: props.ends_at });
  }

  function renderEventContent(arg: EventContentArg) {
    const selected = Boolean(
      (arg.event.extendedProps as { selected?: boolean }).selected,
    );
    const time = formatSlotTime(arg.event.startStr);
    return (
      <div className="fc-booking-slot-btn" aria-pressed={selected}>
        <span className="fc-booking-slot-btn__time">{time}</span>
        {!arg.view.type.startsWith('dayGrid') && (
          <span className="fc-booking-slot-btn__label">
            {selected ? t('scheduling.book.slot_selected') : t('scheduling.book.available_slot')}
          </span>
        )}
      </div>
    );
  }

  if (nextSlotLoading || !nextSlotFetched) {
    return (
      <p className="text-sm text-gray-500" role="status">
        {t('scheduling.book.checking_availability')}
      </p>
    );
  }

  if (nextSlotError) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        role="alert"
      >
        <p className="font-medium">{t('scheduling.book.availability_error_title')}</p>
        <p className="mt-1 text-red-800">{t('scheduling.book.availability_error_body')}</p>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-red-900 underline underline-offset-2"
          onClick={() => void refetchNextSlot()}
        >
          {t('common.try_again')}
        </button>
      </div>
    );
  }

  if (!nextSlot) {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        <p className="font-medium">{t('scheduling.book.no_availability_title')}</p>
        <p className="mt-1 text-amber-800">{t('scheduling.book.no_availability_body')}</p>
      </div>
    );
  }

  const busy = isLoading || isFetching;
  const useFitHeight = fitToScreen || isNarrow;
  const calendarHeight = useFitHeight
    ? Math.max(height ?? 0, isNarrow ? 420 : 560)
    : undefined;

  return (
    <div className="space-y-4">
      {slotsError && (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          <p className="font-medium">{t('scheduling.book.availability_error_title')}</p>
          <p className="mt-1 text-red-800">{t('scheduling.book.availability_error_body')}</p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-red-900 underline underline-offset-2"
            onClick={() => void refetchSlots()}
          >
            {t('common.try_again')}
          </button>
        </div>
      )}
      <div
        ref={fitRef}
        className={`fc-booking-calendar relative${useFitHeight ? ' fc-daycell-scroll' : ''}`}
        style={{ height: calendarHeight, minHeight: isNarrow ? 420 : 560 }}
        aria-busy={busy}
      >
        {busy && (
          <p className="absolute start-3 top-14 z-10 rounded bg-white/90 px-2 py-1 text-xs text-gray-500">
            {t('common.loading')}
          </p>
        )}
        <FullCalendar
          key={offeringId}
          ref={calendarRef}
          plugins={CALENDAR_PLUGINS}
          initialView="dayGridMonth"
          initialDate={nextSlot.starts_at}
          locales={CALENDAR_LOCALES}
          locale={i18n.language === 'en' ? 'en' : 'he'}
          direction={isRtl ? 'rtl' : 'ltr'}
          timeZone="Asia/Jerusalem"
          headerToolbar={headerToolbar}
          customButtons={customButtons}
          height={useFitHeight ? '100%' : 'auto'}
          expandRows={useFitHeight}
          dayMaxEvents={false}
          nowIndicator
          eventDisplay="block"
          displayEventEnd={false}
          slotEventOverlap={false}
          allDaySlot={false}
          slotMinTime={timeWindow.min}
          slotMaxTime={timeWindow.max}
          scrollTime={initialScrollTime}
          eventMinHeight={isNarrow ? 44 : 36}
          dayCellContent={dayCellContent}
          dayCellClassNames={shadedDayClassNames}
          dayHeaderContent={renderDayHeaderContent}
          events={calendarEvents}
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          validRange={validRange}
          stickyHeaderDates
          handleWindowResize
        />
      </div>

      <section className="space-y-3" aria-label={t('scheduling.book.slot_buttons_label')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold sm:text-lg">
            {t('scheduling.book.times_on_day', {
              day: formatDayHeading(activeDate, i18n.language),
            })}
          </h3>
          {!busy && daySlots.length > 0 && (
            <p className="text-sm text-gray-500">
              {t('scheduling.book.slot_count', { count: daySlots.length })}
            </p>
          )}
        </div>

        {busy ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : daySlots.length === 0 ? (
          <p className="text-sm text-gray-500">{t('scheduling.book.no_slots')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {daySlots.map((s) => {
              const selected = selectedSlot?.starts_at === s.starts_at;
              return (
                <button
                  key={s.starts_at}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectSlot(s)}
                  className={cn(
                    'min-h-12 rounded-md border px-2 py-2.5 text-sm font-semibold transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2',
                    selected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary,#fff)] shadow-sm'
                      : 'border-gray-300 bg-white text-gray-900 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-secondary,#f9fafb)]',
                  )}
                >
                  {formatSlotTime(s.starts_at)}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

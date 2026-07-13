import { darkenColor, getAccessibleTextColor } from '@/lib/utils';
import type { ScheduleEvent } from '../types';

/** Neutral colour for blocked/unavailable time. */
const BLOCKED: EventColor = { background: '#9ca3af', border: '#6b7280', text: '#ffffff' };

/**
 * Vivid palette in rainbow order (ROYGBIV → pink), with a few earthy tones at the
 * end used only when a tenant has many classes. Colours are assigned to classes in
 * this order (see resolver), so distinct classes step through the spectrum rather
 * than clumping — an algorithmic HSL rainbow oversamples greens/teals, and hashing
 * gives no spread guarantee, so few classes could all land on similar colours.
 * (A tenant brand-aligned palette can return as an opt-in later.)
 */
const CLASS_PALETTE = [
  '#e6194b', // red
  '#f58231', // orange
  '#f5b800', // gold
  '#ffe119', // yellow
  '#a0d911', // lime
  '#3cb44b', // green
  '#13a89e', // teal
  '#21b8e6', // cyan
  '#4363d8', // blue
  '#6a3fd4', // indigo
  '#a029c2', // purple
  '#e6329b', // magenta
  '#ff5fa2', // pink
  '#9a6324', // brown (overflow)
  '#800000', // maroon (overflow)
  '#808000', // olive (overflow)
];

export interface EventColor {
  background: string;
  border: string;
  text: string;
}

/** Deterministic 32-bit hash of a string; used only as a fallback ordering seed. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Minutes from the start of the week (Sun 00:00) for a class's first occurrence. */
function weekSlot(startsAt: string): number {
  const d = new Date(startsAt);
  return d.getDay() * 1440 + d.getHours() * 60 + d.getMinutes();
}

/**
 * Builds a colour resolver that assigns palette colours to classes in rainbow order.
 * Classes are ordered by their weekly time slot (day-of-week, then time), so distinct
 * classes step through the spectrum and the same class keeps its colour across months
 * (a weekly timetable's slot ordering is stable regardless of the window shown).
 * Blocked time is neutral grey.
 *
 * Pass the events for the current window; memoise the result on `events` in the
 * component so FullCalendar doesn't reprocess options on every render.
 */
export function createScheduleColorResolver(
  events: Pick<ScheduleEvent, 'event_type' | 'offering_id' | 'id' | 'starts_at'>[] = [],
) {
  // Earliest weekly slot per class key, so ordering is stable across navigation.
  const slotByKey = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === 'blocked') continue;
    const key = e.offering_id ?? e.id;
    const slot = weekSlot(e.starts_at);
    const current = slotByKey.get(key);
    if (current === undefined || slot < current) slotByKey.set(key, slot);
  }

  const orderedKeys = [...slotByKey.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
    .map(([key]) => key);
  const indexByKey = new Map(orderedKeys.map((key, i) => [key, i]));

  return function resolve(
    evt: Pick<ScheduleEvent, 'event_type' | 'offering_id' | 'id'>,
  ): EventColor {
    if (evt.event_type === 'blocked') return BLOCKED;
    const key = evt.offering_id ?? evt.id;
    const index = indexByKey.get(key) ?? hashString(key);
    const background = CLASS_PALETTE[index % CLASS_PALETTE.length];
    return {
      background,
      border: darkenColor(background, 14),
      text: getAccessibleTextColor(background),
    };
  };
}

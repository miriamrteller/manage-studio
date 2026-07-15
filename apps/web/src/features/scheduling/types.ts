export type ScheduleEventType = 'class' | 'session' | 'appointment' | 'blocked';

/** Row returned by get_schedule_events / get_public_schedule_events_by_subdomain. */
export interface ScheduleEvent {
  id: string;
  event_type: ScheduleEventType;
  title: string;
  starts_at: string;
  ends_at: string;
  ref_id?: string | null;
  offering_id?: string | null;
}

/** Manually blocked time slot. */
export interface SchedulingBlock {
  id: string;
  tenant_id: string;
  summary: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

/** FullCalendar event colours keyed by event_type. */
export const SCHEDULE_EVENT_COLORS: Record<ScheduleEventType, string> = {
  class: '#2563eb', // blue
  session: '#0d9488', // teal
  appointment: '#7c3aed', // purple
  blocked: '#6b7280', // grey
};

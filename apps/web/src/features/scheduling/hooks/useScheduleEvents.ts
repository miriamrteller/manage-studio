import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { ScheduleService } from '../service';
import type { ScheduleEvent } from '../types';

/**
 * Fetches timetable events for the active calendar window.
 * The range changes as the user navigates FullCalendar (datesSet).
 */
export function useScheduleEvents(range: { start: Date; end: Date } | null) {
  const tenant = useTenant();

  return useQuery<ScheduleEvent[]>({
    queryKey: ['scheduleEvents', tenant?.id, range?.start?.toISOString(), range?.end?.toISOString()],
    queryFn: async () => {
      if (!tenant?.id || !range) return [];
      return ScheduleService.listEvents(tenant as never, range);
    },
    enabled: !!tenant?.id && !!range,
    staleTime: 60 * 1000,
  });
}

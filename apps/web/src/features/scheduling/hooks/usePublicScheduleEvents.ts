import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { ScheduleService } from '../service';
import type { ScheduleEvent } from '../types';

/**
 * Anon-safe public timetable feed for the client-facing calendar.
 * Resolves the tenant by subdomain (no auth required) and refetches as the
 * user navigates the FullCalendar window (datesSet).
 */
export function usePublicScheduleEvents(range: { start: Date; end: Date } | null) {
  const tenant = useTenant();

  return useQuery<ScheduleEvent[]>({
    queryKey: [
      'publicScheduleEvents',
      tenant?.subdomain,
      range?.start?.toISOString(),
      range?.end?.toISOString(),
    ],
    queryFn: async () => {
      if (!tenant?.subdomain || !range) return [];
      return ScheduleService.listPublicEvents(tenant.subdomain, range);
    },
    enabled: !!tenant?.subdomain && !!range,
    staleTime: 60 * 1000,
  });
}

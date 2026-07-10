import { useQuery } from '@tanstack/react-query';
import type { Tenant } from '@shared/schemas';
import { ScheduleService } from '../service';

const FORWARD_WINDOW_DAYS = 180;

type NextEventParams =
  | { source: 'public'; subdomain: string | undefined }
  | { source: 'admin'; tenant: { id: string } | null };

/**
 * Resolves the start date of the next upcoming event within a forward window,
 * so the calendar can open on the month that contains the next class rather
 * than always starting on today. Returns null when nothing is scheduled ahead.
 */
export function useNextEventDate(params: NextEventParams) {
  const keyPart = params.source === 'public' ? params.subdomain : params.tenant?.id;

  return useQuery<Date | null>({
    queryKey: ['nextEventDate', params.source, keyPart],
    queryFn: async () => {
      const now = new Date();
      const end = new Date(now.getTime() + FORWARD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const range = { start: now, end };

      const events =
        params.source === 'public'
          ? await ScheduleService.listPublicEvents(params.subdomain as string, range)
          : await ScheduleService.listEvents(params.tenant as unknown as Tenant, range);

      const next = events
        .map((e) => new Date(e.starts_at))
        .filter((d) => d.getTime() >= now.getTime())
        .sort((a, b) => a.getTime() - b.getTime())[0];

      return next ?? null;
    },
    enabled: !!keyPart,
    staleTime: 5 * 60 * 1000,
  });
}

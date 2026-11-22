import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { ShootGalleryService } from '../services/shootGalleryService';

const SENT_KEY = 'job-gallery-sent';

/**
 * "Send gallery" for one shoot (resend: true, its button shows when it last went) or
 * several (already sent ones are skipped). The list, shoot pages and gallery state refresh.
 */
export function useSendShootGallery({ resend = false }: { resend?: boolean } = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ engagementIds, message }: { engagementIds: string[]; message?: string }) =>
      ShootGalleryService.send(engagementIds, { resend, message }),
    onSuccess: () => {
      // 'jobs' is useJobs' key: the list and every shoot page under it.
      void queryClient.invalidateQueries({ queryKey: ['jobs', tenant?.id] });
      void queryClient.invalidateQueries({ queryKey: ['job-gallery'] });
      void queryClient.invalidateQueries({ queryKey: [SENT_KEY] });
    },
  });
}

/**
 * The gallery email's standard main paragraph, in the language the email goes in (the
 * studio's language): the "Edit email text" box starts with it. Loaded only when the box opens.
 */
export function useGalleryEmailStandardBody(enabled: boolean) {
  const tenant = useTenant();
  const language = tenant?.language_default === 'he' ? 'he' : 'en';
  const query = useQuery({
    queryKey: ['gallery-email-standard-body', language],
    queryFn: async () => {
      const strings = language === 'he'
        ? (await import('@shared/i18n/email-templates-he.json')).default
        : (await import('@shared/i18n/email-templates-en.json')).default;
      return strings.gallery_ready.body;
    },
    enabled,
    staleTime: Infinity,
  });
  return { body: query.data, language };
}

/** engagement id -> when its gallery email last went. One query for the whole list. */
export function useGalleryLastSent(engagementIds: string[]) {
  const ids = [...engagementIds].sort();
  const query = useQuery({
    queryKey: [SENT_KEY, ids],
    queryFn: () => ShootGalleryService.lastSent(ids),
    enabled: ids.length > 0,
  });
  return query.data ?? new Map<string, string>();
}

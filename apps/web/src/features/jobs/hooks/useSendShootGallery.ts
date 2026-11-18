import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { ShootGalleryService } from '../services/shootGalleryService';

/** "Send gallery" for one shoot or several; the list, the shoot pages and their gallery state refresh. */
export function useSendShootGallery() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (engagementIds: string[]) => ShootGalleryService.send(engagementIds),
    onSuccess: () => {
      // 'jobs' is useJobs' key: the list and every shoot page under it.
      void queryClient.invalidateQueries({ queryKey: ['jobs', tenant?.id] });
      void queryClient.invalidateQueries({ queryKey: ['job-gallery'] });
    },
  });
}

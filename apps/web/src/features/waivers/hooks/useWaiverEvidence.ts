import { useQuery } from '@tanstack/react-query';
import { WaiverService } from '../service';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

export function useWaiverEvidence(page = 1) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['waiver-evidence', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return WaiverService.listEvidence(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: !!tenant?.id,
  });
}

import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { EnrolmentService } from '../service';
import { buildEnrolledOfferingKeys } from '../lib/enrolled-offerings';

export function usePersonExistingEnrolments(
  personId?: string,
  enabled: boolean = true,
) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['person-existing-enrolments', tenant?.id, personId],
    queryFn: async () => {
      if (!tenant || !personId) return new Set<string>();

      const { enrolments } = await EnrolmentService.list(tenant, {
        personId,
        pageSize: 200,
      });

      return buildEnrolledOfferingKeys(enrolments);
    },
    enabled: enabled && Boolean(tenant?.id && personId),
    staleTime: 60 * 1000,
  });
}

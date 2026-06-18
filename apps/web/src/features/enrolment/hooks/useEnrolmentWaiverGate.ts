import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import {
  resolveEnrolmentWaiverGate,
  type EnrolmentWaiverGateResult,
} from '../lib/checkEngagementWaiver';

interface UseEnrolmentWaiverGateParams {
  engagementId?: string;
  personId?: string;
  offeringId?: string;
  enabled?: boolean;
}

export function useEnrolmentWaiverGate({
  engagementId,
  personId,
  offeringId,
  enabled = true,
}: UseEnrolmentWaiverGateParams) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['enrolment-waiver-gate', tenant?.id, engagementId, personId, offeringId],
    enabled: enabled && !!tenant?.id && !!engagementId && !!personId && !!offeringId,
    queryFn: async (): Promise<EnrolmentWaiverGateResult> => {
      if (!tenant || !engagementId || !personId || !offeringId) {
        throw new Error('Missing enrolment waiver gate params');
      }
      return resolveEnrolmentWaiverGate(tenant, { engagementId, personId, offeringId });
    },
  });
}

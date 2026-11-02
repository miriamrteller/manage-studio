import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { EnrolmentCancellationService } from '../lib/cancelEnrolment';
import type { CancelEnrolmentInputSchema } from '@shared/schemas';
import type { z } from 'zod';

interface UseCancelEnrolmentOptions {
  personId: string;
  onSuccess?: () => void;
  /** The enrolment is active (paid): cancel it and stop its monthly plan. */
  active?: boolean;
}

export function useCancelEnrolment({ personId, onSuccess, active = false }: UseCancelEnrolmentOptions) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: z.infer<typeof CancelEnrolmentInputSchema>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return active
        ? EnrolmentCancellationService.cancelActive(tenant, input)
        : EnrolmentCancellationService.cancelPrePayment(tenant, input);
    },
    onSuccess: async () => {
      if (!tenant?.id) return;
      const tenantId = tenant.id;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-detail-enrolments', tenantId, personId] }),
        queryClient.invalidateQueries({ queryKey: ['students-list-enrolments', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['students', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['all-enrolled-person-ids', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['enrolled-person-ids', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['enrolments', tenantId] }),
      ]);
      onSuccess?.();
    },
  });
}

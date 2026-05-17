import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BillingAccountService } from '../service';
import { useTenant } from '@/hooks/useTenant';
import type { BillingAccountCreate } from '@shared/schemas';

interface UseCreateBillingAccountOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * useCreateBillingAccount: Mutation for creating a billing account
 * - Uses BillingAccountService for creation
 * - Invalidates billing account queries on success
 * - Handles error callback for UI feedback
 */
export function useCreateBillingAccount(
  options?: UseCreateBillingAccountOptions
) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BillingAccountCreate) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return BillingAccountService.create(tenant, data);
    },
    onSuccess: () => {
      // Invalidate all billing account queries for this tenant
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['billingAccounts', tenant.id],
        });
      }
      options?.onSuccess?.();
    },
    onError: (error: unknown) => {
      options?.onError?.(error);
    },
  });
}

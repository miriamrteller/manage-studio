import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BillingAccountService } from '../service';
import { useTenant } from '@/hooks/useTenant';

interface UseDeleteBillingAccountOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * useDeleteBillingAccount: Mutation for deleting a billing account
 * - Uses BillingAccountService for deletion
 * - Invalidates billing account queries on success
 * - Handles error callback for UI feedback
 */
export function useDeleteBillingAccount(
  options?: UseDeleteBillingAccountOptions
) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accountId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return BillingAccountService.delete(tenant, accountId);
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

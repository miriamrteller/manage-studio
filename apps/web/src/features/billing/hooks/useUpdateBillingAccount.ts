import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BillingAccountService } from '../service';
import { useTenant } from '@/hooks/useTenant';
import type { BillingAccountUpdate } from '@shared/schemas';

/** Save business invoice details / status of a billing account; refreshes list and detail. */
export function useUpdateBillingAccount(id: string, options?: { onSuccess?: () => void }) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (changes: BillingAccountUpdate) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return BillingAccountService.update(tenant, id, changes);
    },
    onSuccess: async () => {
      if (tenant?.id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['billingAccounts', tenant.id] }),
          queryClient.invalidateQueries({ queryKey: ['billingAccount', tenant.id, id] }),
        ]);
      }
      options?.onSuccess?.();
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { BillingAccountService } from '../service';
import { useTenant } from '@/hooks/useTenant';

interface UseBillingAccountOptions {
  enabled?: boolean;
}

/**
 * useBillingAccount: Fetch a single billing account by ID
 * - Uses BillingAccountService for data operations
 * - Validates response with BillingAccountSchema
 * - Enables based on tenant + account ID availability
 */
export function useBillingAccount(
  accountId: string | null | undefined,
  { enabled = true }: UseBillingAccountOptions = {}
) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['billingAccount', tenant?.id, accountId],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      if (!accountId) throw new Error('Account ID required');
      return BillingAccountService.get(tenant, accountId);
    },
    enabled: enabled && !!tenant?.id && !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

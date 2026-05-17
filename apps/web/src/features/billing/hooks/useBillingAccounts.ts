import { useQuery } from '@tanstack/react-query';
import { BillingAccountService } from '../service';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

interface UseBillingAccountsOptions {
  page?: number;
  enabled?: boolean;
}

/**
 * useBillingAccounts: Fetch paginated list of billing accounts
 * - Uses BillingAccountService for data operations
 * - Validates response with BillingAccountSchema
 * - Enables based on tenant + enabled flag availability
 */
export function useBillingAccounts({
  page = 1,
  enabled = true,
}: UseBillingAccountsOptions = {}) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['billingAccounts', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return BillingAccountService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

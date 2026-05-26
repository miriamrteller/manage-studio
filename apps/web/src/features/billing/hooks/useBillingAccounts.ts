import { useQuery } from '@tanstack/react-query';
import { BillingAccountService, type BillingSortField, DEFAULT_BILLING_SORT } from '../service';
import { useTenant } from '@/hooks/useTenant';
import type { SortOrder } from '@/lib/list-query';

const PAGE_SIZE = 20;

interface UseBillingAccountsOptions {
  page?: number;
  searchQuery?: string;
  paymentMethod?: string;
  status?: string;
  sortField?: BillingSortField;
  sortOrder?: SortOrder;
  enabled?: boolean;
}

export function useBillingAccounts({
  page = 1,
  searchQuery = '',
  paymentMethod,
  status,
  sortField = DEFAULT_BILLING_SORT.field,
  sortOrder = DEFAULT_BILLING_SORT.order,
  enabled = true,
}: UseBillingAccountsOptions = {}) {
  const tenant = useTenant();

  return useQuery({
    queryKey: [
      'billingAccounts',
      tenant?.id,
      page,
      searchQuery,
      paymentMethod,
      status,
      sortField,
      sortOrder,
    ],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return BillingAccountService.list(tenant, {
        page,
        pageSize: PAGE_SIZE,
        searchQuery,
        paymentMethod,
        status,
        sortField,
        sortOrder,
      });
    },
    enabled: enabled && !!tenant?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import type { PaymentsLogFilters } from '../services/paymentsLogService';
import { PaymentsLogService, PAYMENTS_LOG_PAGE_SIZE } from '../services/paymentsLogService';

export function usePaymentsLog({
  page = 1,
  filters = {},
  enabled = true,
}: {
  page?: number;
  filters?: PaymentsLogFilters;
  enabled?: boolean;
} = {}) {
  const tenant = useTenant();

  const query = useQuery({
    queryKey: ['payments-log', tenant?.id, page, filters],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PaymentsLogService.list(tenant, { page, filters });
    },
    enabled: enabled && !!tenant?.id,
  });

  return {
    rows: query.data?.rows ?? [],
    totalCount: query.data?.totalCount ?? 0,
    page: query.data?.page ?? page,
    pageSize: query.data?.pageSize ?? PAYMENTS_LOG_PAGE_SIZE,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

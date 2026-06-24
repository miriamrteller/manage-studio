import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { FinanceSummaryService } from '../services/financeSummaryService';

export function useFinanceSummary({
  startDate,
  endDate,
  enabled = true,
}: {
  startDate: string;
  endDate: string;
  enabled?: boolean;
}) {
  const tenant = useTenant();

  const query = useQuery({
    queryKey: ['finance-summary', tenant?.id, startDate, endDate],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FinanceSummaryService.getSummary(tenant, startDate, endDate);
    },
    enabled: enabled && !!tenant?.id && !!startDate && !!endDate,
  });

  return {
    summary: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useOutstandingEngagements(enabled = true) {
  const tenant = useTenant();

  const seasonQuery = useQuery({
    queryKey: ['active-season-id', tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FinanceSummaryService.getActiveSeasonId(tenant);
    },
    enabled: enabled && !!tenant?.id,
  });

  const listQuery = useQuery({
    queryKey: ['outstanding-engagements', tenant?.id, seasonQuery.data],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FinanceSummaryService.listOutstandingEngagements(tenant, seasonQuery.data ?? null);
    },
    enabled: enabled && !!tenant?.id && seasonQuery.isFetched,
  });

  return {
    seasonId: seasonQuery.data,
    engagements: listQuery.data ?? [],
    isLoading: seasonQuery.isLoading || listQuery.isLoading,
    error: seasonQuery.error ?? listQuery.error,
    hasActiveSeason: seasonQuery.data != null,
  };
}

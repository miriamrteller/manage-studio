import { useQuery } from '@tanstack/react-query';
import {
  AdminDashboardService,
  NoActiveSeasonError,
} from '@/features/admin-dashboard/services/adminDashboardService';
import type { AdminDashboardOverview } from '@shared/schemas';

export interface AdminDashboardState {
  overview: AdminDashboardOverview | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** True when the tenant has no active season (P0001 from RPC). */
  isNoActiveSeason: boolean;
}

export function useAdminDashboard(): AdminDashboardState {
  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-dashboard-overview'],
    queryFn: () => AdminDashboardService.getOverview(),
    retry: false, // AdminDashboardService.withRetry handles retries internally
  });

  const isNoActiveSeason = error instanceof NoActiveSeasonError;

  return {
    overview,
    isLoading,
    error: error instanceof Error ? error : null,
    refetch,
    isNoActiveSeason,
  };
}

import { useQuery } from '@tanstack/react-query';
import { FamilyService } from '../service';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

// Families are read-only in the admin view.
// Creation happens during enrolment intake (EnrolmentOnboardingService).
// Deletion is not permitted — SPEC §D / migration 039: anonymise via RPC only.

interface UseFamiliesOptions {
  page?: number;
  enabled?: boolean;
}

export function useFamilies({ page = 1, enabled = true }: UseFamiliesOptions = {}) {
  const tenant = useTenant();

  const listQuery = useQuery({
    queryKey: ['families', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
  });

  return {
    families: listQuery.data?.families || [],
    total: listQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,
  };
}

import { useQuery } from '@tanstack/react-query';
import { FamilyService, type AccountSortField, DEFAULT_FAMILY_SORT } from '../service';
import { useTenant } from '@/hooks/useTenant';
import type { SortOrder } from '@/lib/list-query';

const DEFAULT_PAGE_SIZE = 20;

interface UseFamiliesOptions {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  sortField?: AccountSortField;
  sortOrder?: SortOrder;
  enabled?: boolean;
}

export function useFamilies({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  searchQuery = '',
  sortField = DEFAULT_FAMILY_SORT.field,
  sortOrder = DEFAULT_FAMILY_SORT.order,
  enabled = true,
}: UseFamiliesOptions = {}) {
  const tenant = useTenant();

  const listQuery = useQuery({
    queryKey: ['families', tenant?.id, page, pageSize, searchQuery, sortField, sortOrder],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.list(tenant, {
        page,
        pageSize,
        searchQuery,
        sortField,
        sortOrder,
      });
    },
    enabled: enabled && !!tenant?.id,
  });

  return {
    families: listQuery.data?.families || [],
    total: listQuery.data?.total || 0,
    page,
    pageSize,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,
  };
}

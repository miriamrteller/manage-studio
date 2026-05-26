import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FamilyService } from '../service';
import { useTenant } from '@/hooks/useTenant';

interface UseFamilySearchOptions {
  enabled?: boolean;
  limit?: number;
}

export function useFamilySearch(
  searchQuery: string,
  { enabled = true, limit = 10 }: UseFamilySearchOptions = {}
) {
  const tenant = useTenant();
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const query = useQuery({
    queryKey: ['familySearch', tenant?.id, debouncedQuery, limit],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      const result = await FamilyService.list(tenant, {
        page: 1,
        pageSize: limit,
        searchQuery: debouncedQuery,
        sortField: 'name',
        sortOrder: 'asc',
      });
      return result.families;
    },
    enabled: enabled && !!tenant?.id && debouncedQuery.trim().length >= 1,
  });

  return {
    families: query.data || [],
    isSearching: query.isLoading || debouncedQuery !== searchQuery,
    error: query.error,
  };
}

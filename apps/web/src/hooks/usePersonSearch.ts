import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { PersonService } from '@/features/people/service';
import type { PersonSearchResult } from '@/features/people/types';

export function usePersonSearch(searchQuery: string, enabled = true) {
  const tenant = useTenant();
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const query = useQuery({
    queryKey: ['person-search', tenant?.id, debouncedQuery],
    queryFn: async (): Promise<PersonSearchResult[]> => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PersonService.searchPeople(tenant, debouncedQuery);
    },
    enabled: enabled && !!tenant?.id && debouncedQuery.trim().length > 0,
  });

  return {
    results: query.data ?? [],
    isSearching: query.isLoading,
    error: query.error,
  };
}

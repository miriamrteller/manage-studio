import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PersonSchema } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

// Schema source: SPEC.md Migration 002
// Search people by name or email with 300ms debounce
// Limit results to 10 and filter by tenant_id
// Returns Person array or empty array if no results

interface UsePersonSearchOptions {
  enabled?: boolean;
}

export function usePersonSearch(
  searchQuery: string,
  { enabled = true }: UsePersonSearchOptions = {}
) {
  const tenant = useTenant();
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const query = useQuery({
    queryKey: ['personSearch', tenant?.id, debouncedQuery],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      if (!debouncedQuery.trim()) return [];

      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('tenant_id', tenant.id)
        .or(`name.ilike.%${debouncedQuery}%, email.ilike.%${debouncedQuery}%`)
        .limit(10);

      if (error) throw new Error(`Search failed: ${error.message}`);

      return (data || []).map(person => PersonSchema.parse(person));
    },
    enabled: enabled && !!tenant?.id && debouncedQuery.trim().length > 0,
  });

  return {
    results: query.data || [],
    isSearching: query.isLoading,
    error: query.error,
  };
}

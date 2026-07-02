import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BlastAccountSearchResult } from '../lib/notificationBlastSchema';

export function useAccountBlastSearch(query: string, enabled = true) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const result = useQuery({
    queryKey: ['notificationBlastAccountSearch', debouncedQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_notification_blast_accounts', {
        p_query: debouncedQuery,
      });
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as BlastAccountSearchResult[];
    },
    enabled: enabled && debouncedQuery.trim().length >= 1,
  });

  return {
    results: result.data ?? [],
    isSearching: result.isLoading || debouncedQuery !== query,
    error: result.error,
  };
}

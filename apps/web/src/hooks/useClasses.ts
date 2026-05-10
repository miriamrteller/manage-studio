import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useTenant } from './useTenant';
import { PublicClassSchema, type PublicClass } from '../schemas';

/**
 * useClasses: Manages public classes fetching and caching
 * - Fetches classes from Supabase with tenant filtering
 * - Validates response with Zod schema
 * - Uses React Query for caching (5-min stale time)
 * - Returns loading, error, and data states
 * 
 * Separation of concerns:
 * - This hook handles all data logic: API calls, caching, validation
 * - ClassesList component handles UI rendering only
 * - Pages compose these together
 */

export interface UseClassesResult {
  classes: PublicClass[];
  isLoading: boolean;
  error: Error | null;
  isRefetching: boolean;
}

export function useClasses(): UseClassesResult {
  const tenant = useTenant();

  const { data: classes = [], isLoading, error, isRefetching } = useQuery({
    queryKey: ['publicClasses', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        console.warn('Tenant not resolved for classes query');
        return [];
      }

      const { data, error: err } = await supabase
        .from('classes')
        .select('id, tenant_id, name, start_time, end_time, price_minor, max_capacity')
        .eq('tenant_id', tenant.id)
        .eq('is_public', true)
        .order('start_time', { ascending: true });

      if (err) {
        console.warn('Failed to fetch classes:', err.message);
        throw err;
      }

      // Validate response with Zod
      try {
        return z.array(PublicClassSchema).parse(data || []);
      } catch (parseErr) {
        console.error('Invalid class data from Supabase:', parseErr);
        throw new Error('Invalid class data format');
      }
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  return {
    classes,
    isLoading,
    error: error instanceof Error ? error : null,
    isRefetching,
  };
}

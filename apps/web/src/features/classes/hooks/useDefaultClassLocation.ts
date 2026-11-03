import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { defaultClassLocation } from '../lib/defaultLocation';

/** Where a new class most likely happens: see defaultClassLocation. Null while unknown. */
export function useDefaultClassLocation(enabled = true): string | null {
  const tenant = useTenant();
  const { data: legal } = useTenantLegalProfile();
  const { data: locations } = useQuery({
    queryKey: ['class-locations', tenant?.id],
    enabled: enabled && !!tenant?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('location')
        .eq('tenant_id', tenant!.id)
        .eq('offering_type', 'class')
        .not('location', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((row: { location: string | null }) => row.location);
    },
  });
  if (!enabled) return null;
  return defaultClassLocation(locations ?? [], legal?.profile.address);
}

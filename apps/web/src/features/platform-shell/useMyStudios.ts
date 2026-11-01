import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { tenantOrigin } from '@/lib/tenantUrl';
import type { UserProfile } from '@/types/auth';

export interface StudioLink {
  id: string;
  name: string;
  url: string;
}

/**
 * Studios the signed-in user can open: their own studio, or every studio for the
 * platform owner (super_admin; RLS lets only that role read all tenants).
 */
export function useMyStudios(user: Pick<UserProfile, 'id' | 'role' | 'tenant_id'> | null) {
  const isSuperAdmin = Boolean(user?.role.includes('super_admin'));
  return useQuery({
    queryKey: ['my-studios', user?.id, isSuperAdmin],
    enabled: Boolean(user),
    queryFn: async (): Promise<StudioLink[]> => {
      let query = supabase.from('tenants').select('id, name, subdomain').order('name');
      if (!isSuperAdmin) query = query.eq('id', user?.tenant_id ?? '');
      const { data, error } = await query;
      if (error) throw new Error(`Failed to load studios: ${error.message}`);
      return (data ?? [])
        .filter((row) => Boolean(row.subdomain))
        .map((row) => ({
          id: row.id,
          name: row.name?.trim() || row.subdomain,
          url: tenantOrigin(row.subdomain),
        }));
    },
  });
}

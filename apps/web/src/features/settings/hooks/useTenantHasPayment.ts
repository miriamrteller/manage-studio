import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const TENANT_HAS_PAYMENT_QUERY = 'tenant-has-payment';

/**
 * Whether the studio has taken a real payment yet (succeeded, or later refunded; manual ones
 * count). Until then it may change its payment provider freely (the database guard uses the
 * same rule). `undefined` while loading or when the check fails: callers treat that as "yes".
 */
export async function fetchTenantHasPayment(tenantId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['succeeded', 'partially_refunded', 'refunded']);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export function useTenantHasPayment(tenantId: string | null | undefined): boolean | undefined {
  const { data } = useQuery({
    queryKey: [TENANT_HAS_PAYMENT_QUERY, tenantId],
    queryFn: () => fetchTenantHasPayment(tenantId!),
    enabled: Boolean(tenantId),
    retry: false,
  });
  return data;
}

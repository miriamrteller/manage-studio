import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import { manualPaymentMethodsFor, type ManualPaymentMethod } from '../lib/manualPaymentMethods';

export const ACCEPT_UNRECEIPTED_BIT_QUERY = 'accept-unreceipted-bit';

/** The studio's "Accept Bit / PayBox anyway" setting (false while loading or on error). */
export function useAcceptUnreceiptedBit(): boolean {
  const tenant = useTenant();
  const query = useQuery({
    queryKey: [ACCEPT_UNRECEIPTED_BIT_QUERY, tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('accept_unreceipted_bit')
        .eq('id', tenant!.id)
        .maybeSingle();
      if (error) return false;
      return Boolean(data?.accept_unreceipted_bit);
    },
  });
  return query.data ?? false;
}

/** The methods "Record a payment" offers this studio. */
export function useManualPaymentMethods(): ManualPaymentMethod[] {
  const tenant = useTenant();
  const acceptUnreceiptedBit = useAcceptUnreceiptedBit();
  return manualPaymentMethodsFor({ invoicingProvider: tenant?.invoicing_provider, acceptUnreceiptedBit });
}

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface SignedInPrefill {
  name: string;
  email: string;
  phone: string;
}

/**
 * What OpalSwift already knows about the signed-in visitor, to pre-fill forms:
 * name and email from their profile, and a phone from get_my_last_signer_details
 * (their last signed form, or their own stored contact_preferences number). The
 * RPC only reads the caller's own records. Empty strings when signed out or
 * unknown; never throws, so a form never waits on it.
 */
export function useSignedInPrefill(): SignedInPrefill {
  const { user } = useCurrentUser();
  const userId = user?.id;

  const phoneQuery = useQuery({
    queryKey: ['signed-in-prefill-phone', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<string> => {
      try {
        const { data, error } = await supabase.rpc('get_my_last_signer_details');
        if (error || !data || typeof data !== 'object') return '';
        const phone = (data as { phone?: unknown }).phone;
        return typeof phone === 'string' ? phone.trim() : '';
      } catch {
        return '';
      }
    },
  });

  return {
    name: user?.full_name?.trim() ?? '',
    email: user?.email?.trim() ?? '',
    phone: userId ? phoneQuery.data ?? '' : '',
  };
}

/**
 * Puts `value` into a form field once, when it first becomes known, and only if
 * the field is still empty: anything the person typed is kept, and the field
 * stays editable (clearing it later does not refill it).
 */
export function useFillWhenEmpty(
  value: string | null | undefined,
  setField: Dispatch<SetStateAction<string>>,
  enabled = true,
): void {
  const filled = useRef(false);
  useEffect(() => {
    if (!enabled || filled.current || !value) return;
    filled.current = true;
    setField((current) => (current.trim() ? current : value));
  }, [value, setField, enabled]);
}

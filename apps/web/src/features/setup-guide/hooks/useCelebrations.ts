import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import {
  nextCelebration,
  parseCelebrations,
  reachedMoments,
  type CelebrationMoment,
  type CelebrationState,
  type MomentFacts,
} from '../lib/setupFun';

export interface Celebrations {
  /** The moment being celebrated now, until dismissed. */
  active: CelebrationMoment | null;
  dismiss: () => void;
  /** "Fewer celebrations": no confetti and no cheers. */
  fewer: boolean;
  setFewer: (value: boolean) => void;
}

/**
 * The three once-per-studio moments (setup finished, first enquiry, first paid client)
 * and the "Fewer celebrations" choice, kept on tenants.celebrations. Best effort: if it
 * cannot be read or saved, nothing is celebrated and nothing else is affected.
 */
export function useCelebrations(facts: MomentFacts & { ready: boolean }): Celebrations {
  const tenant = useTenant();
  const tenantId = tenant?.id;
  const queryClient = useQueryClient();
  const key = ['tenant-celebrations', tenantId];
  const { data: state } = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CelebrationState | null> => {
      const { data, error } = await supabase.from('tenants').select('celebrations').eq('id', tenantId!).maybeSingle();
      if (error || !data) return null;
      return parseCelebrations((data as { celebrations?: unknown }).celebrations);
    },
  });
  const [active, setActive] = useState<CelebrationMoment | null>(null);
  const [fewerLocal, setFewerLocal] = useState<boolean | null>(null);
  const writing = useRef(false);

  const store = useCallback(
    async (next: CelebrationState) => {
      queryClient.setQueryData(key, next);
      const { error } = await supabase.from('tenants').update({ celebrations: next }).eq('id', tenantId!);
      return !error;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is derived from tenantId
    [queryClient, tenantId],
  );

  const { ready, setupComplete, leads, paidClients } = facts;
  useEffect(() => {
    if (!ready || !state || !tenantId || writing.current || active) return;
    const { celebrate, next } = nextCelebration(state, reachedMoments({ setupComplete, leads, paidClients }), new Date().toISOString());
    if (!next) return;
    writing.current = true;
    void store(next).finally(() => {
      writing.current = false;
    });
    if (celebrate) setActive(celebrate);
  }, [ready, state, tenantId, setupComplete, leads, paidClients, active, store]);

  const fewer = fewerLocal ?? state?.fewer ?? false;
  const setFewer = useCallback(
    (value: boolean) => {
      setFewerLocal(value);
      if (state) void store({ ...state, fewer: value });
    },
    [state, store],
  );

  return { active, dismiss: useCallback(() => setActive(null), []), fewer, setFewer };
}

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import {
  buildSetupRows,
  EMPTY_FACTS,
  setupProgress,
  type SetupFacts,
  type SetupProgress,
  type SetupRow,
} from '../lib/setupChecklist';

interface Saved {
  skipped: string[];
  closed: boolean;
}

const storageKey = (tenantId: string) => `setup-guide:${tenantId}`;

function load(tenantId: string | undefined): Saved {
  if (!tenantId) return { skipped: [], closed: false };
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return {
        skipped: Array.isArray(parsed.skipped) ? parsed.skipped.filter((s) => typeof s === 'string') : [],
        closed: parsed.closed === true,
      };
    }
  } catch {
    /* private window or blocked storage: start fresh */
  }
  return { skipped: [], closed: false };
}

function save(tenantId: string | undefined, value: Saved) {
  if (!tenantId) return;
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(value));
  } catch {
    /* ignore: the guide still works for this visit */
  }
}

/** Head-only row count for this studio (no row data is read). */
async function count(table: 'categories' | 'seasons' | 'offerings' | 'engagements' | 'leads' | 'quotes', tenantId: string, activeOnly = false) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (activeOnly) q = q.eq('status', 'active');
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

/** Everything the checklist ticks itself from. Counts only, no personal data. */
export function useSetupFacts(): { facts: SetupFacts; isLoading: boolean } {
  const tenant = useTenant();
  const tenantId = tenant?.id;
  const vertical = tenant?.vertical;

  const query = useQuery({
    queryKey: ['setup-guide-facts', tenantId, vertical],
    enabled: !!tenantId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Omit<SetupFacts, 'hasLogo' | 'paymentsReady'> & { legalPublished: boolean }> => {
      const id = tenantId!;
      const dance = vertical === 'dance-studio';
      const [levels, seasons, offerings, enrolments, leads, quotes, legal] = await Promise.all([
        dance ? count('categories', id) : Promise.resolve(0),
        dance ? count('seasons', id) : Promise.resolve(0),
        count('offerings', id, true),
        dance ? count('engagements', id) : Promise.resolve(0),
        count('leads', id),
        vertical === 'photographer' ? count('quotes', id) : Promise.resolve(0),
        supabase.rpc('get_tenant_legal_profile', { p_tenant_id: id }),
      ]);
      const row = Array.isArray(legal.data) ? legal.data[0] : legal.data;
      return {
        levels,
        seasons,
        offerings,
        enrolments,
        leads,
        quotes,
        legalPublished: row?.legal_pages_published === true,
      };
    },
  });

  const provider = tenant?.payment_provider ?? 'offline';
  const paymentsReady =
    provider === 'offline'
      ? Boolean(tenant?.offline_payment_instructions?.trim())
      : Boolean(tenant?.payment_provider_secret_configured);

  const facts: SetupFacts = {
    ...EMPTY_FACTS,
    ...(query.data ?? {}),
    hasLogo: Boolean(tenant?.logo_url || tenant?.logo_dark_url),
    paymentsReady,
  };
  return { facts, isLoading: !!tenantId && query.isLoading };
}

export interface SetupGuide {
  rows: SetupRow[];
  skipped: string[];
  progress: SetupProgress;
  closed: boolean;
  /** Show the card: opened from the menu, or not closed and not finished. */
  visible: boolean;
  isLoading: boolean;
  skip: (id: string) => void;
  unskip: (id: string) => void;
  close: () => void;
  reopen: () => void;
}

/** The checklist plus what the owner chose to skip or close (kept on this device). */
export function useSetupGuide(): SetupGuide {
  const tenant = useTenant();
  const tenantId = tenant?.id;
  const { facts, isLoading } = useSetupFacts();
  const [saved, setSaved] = useState<Saved>(() => load(tenantId));
  // Opened from the menu: stays visible this visit even when everything is done.
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    setSaved(load(tenantId));
  }, [tenantId]);

  const update = useCallback(
    (fn: (s: Saved) => Saved) => {
      setSaved((prev) => {
        const next = fn(prev);
        save(tenantId, next);
        return next;
      });
    },
    [tenantId],
  );

  const rows = buildSetupRows(tenant?.vertical, facts);
  const progress = setupProgress(rows, saved.skipped);
  const close = useCallback(() => {
    setPinned(false);
    update((s) => ({ ...s, closed: true }));
  }, [update]);
  const reopen = useCallback(() => {
    setPinned(true);
    update((s) => ({ ...s, closed: false }));
  }, [update]);
  return {
    rows,
    skipped: saved.skipped,
    progress,
    closed: saved.closed,
    visible: pinned || (!saved.closed && !progress.complete),
    isLoading,
    skip: (id) => update((s) => ({ ...s, skipped: s.skipped.includes(id) ? s.skipped : [...s.skipped, id] })),
    unskip: (id) => update((s) => ({ ...s, skipped: s.skipped.filter((x) => x !== id) })),
    close,
    reopen,
  };
}

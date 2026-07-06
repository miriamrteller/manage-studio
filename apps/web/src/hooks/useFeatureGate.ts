/**
 * React hook that exposes the feature gate for the current tenant.
 *
 * Usage:
 *   const { hasFeature, isLoading } = useFeatureGate();
 *   if (hasFeature(FEATURES.billing.recurring)) { ... }
 *
 * The RPC `get_tenant_features(p_tenant_id)` is created by the Batch 3 SQL migration.
 * Until that migration runs, this hook returns hasFeature() === false for all keys.
 * Components must already handle the falsy case gracefully — nothing will break.
 *
 * Caching: TanStack Query staleTime = 5 minutes (matches Deno gate TTL).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useTenant } from './useTenant';
import type { FeatureKey } from '@shared/index';

export interface FeatureGateResult {
  hasFeature: (key: FeatureKey) => boolean;
  isLoading: boolean;
}

export function useFeatureGate(): FeatureGateResult {
  const tenant = useTenant();

  const { data: featureList = [], isLoading } = useQuery<string[]>({
    queryKey: ['featureGate', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_tenant_features', {
        p_tenant_id: tenant.id,
      });
      if (error) {
        console.error('[useFeatureGate] RPC error', error.message);
        return [];
      }
      return (data ?? []) as string[];
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });

  const featureSet = useMemo(() => new Set<string>(featureList), [featureList]);

  return {
    hasFeature: (key: FeatureKey) => featureSet.has(key),
    isLoading,
  };
}

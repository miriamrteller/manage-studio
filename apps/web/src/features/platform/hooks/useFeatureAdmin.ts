import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudioProfile } from '@shared/index';
import {
  fetchFeatureStates,
  fetchTenants,
  overrideFor,
  setFeatureOverride,
  setStudioProfile,
} from '../services/featureAdminService';
import { profilePatch, type WholeFeature } from '../lib/wholeFeatures';
import type { FeatureState } from '../types/feature-admin';

export function useTenants() {
  return useQuery({ queryKey: ['platform', 'tenants'], queryFn: fetchTenants, staleTime: 2 * 60 * 1000 });
}

export function useFeatureStates(tenantId: string | null) {
  return useQuery({
    queryKey: ['platform', 'feature-states', tenantId],
    queryFn: () => fetchFeatureStates(tenantId!),
    enabled: !!tenantId,
    staleTime: 0,
  });
}

/** Ticks one whole feature: a business answer through set_business_profile, else an override. */
export function useSetWholeFeature(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      feature,
      on,
      profile,
      states,
    }: {
      feature: WholeFeature;
      on: boolean;
      profile: StudioProfile;
      states: readonly FeatureState[];
    }) => {
      if (!tenantId) throw new Error('No studio selected');
      if (feature.kind === 'profile') {
        const patch = profilePatch(feature.id, on, profile);
        if (!patch) throw new Error('A studio needs at least one way to charge');
        await setStudioProfile(tenantId, patch);
        return;
      }
      const state = states.find((s) => s.feature_key === feature.featureKey);
      await setFeatureOverride(tenantId, feature.featureKey!, overrideFor({ default_on: state?.default_on ?? false }, on));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'feature-states', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['featureGate', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
  });
}

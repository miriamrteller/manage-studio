import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteOverride,
  fetchAllFeatureDefinitions,
  fetchTenantOverrides,
  fetchTenants,
  upsertOverride,
} from '../services/featureAdminService';

export function useFeatureDefinitions() {
  return useQuery({
    queryKey: ['platform', 'feature-definitions'],
    queryFn: fetchAllFeatureDefinitions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTenants() {
  return useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: fetchTenants,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTenantOverrides(tenantId: string | null) {
  return useQuery({
    queryKey: ['platform', 'feature-overrides', tenantId],
    queryFn: () => fetchTenantOverrides(tenantId!),
    enabled: !!tenantId,
    staleTime: 0, // Always fresh — mutations happen here
  });
}

export function useToggleFeature(tenantId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureKey,
      enabled,
      isCurrentlyOverridden,
    }: {
      featureKey: string;
      enabled: boolean;
      isCurrentlyOverridden: boolean;
      defaultEnabled: boolean;
    }) => {
      if (!tenantId) throw new Error('No tenant selected');
      // If toggling back to default, remove the override entirely
      // Otherwise upsert the override
      if (isCurrentlyOverridden && enabled === undefined) {
        await deleteOverride(tenantId, featureKey);
      } else {
        await upsertOverride(tenantId, featureKey, enabled);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'feature-overrides', tenantId] });
    },
  });
}

export function useResetFeature(tenantId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (featureKey: string) => {
      if (!tenantId) throw new Error('No tenant selected');
      await deleteOverride(tenantId, featureKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'feature-overrides', tenantId] });
    },
  });
}

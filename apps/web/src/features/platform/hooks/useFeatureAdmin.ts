import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFeatureStates, fetchTenants, setFeatureOverride } from '../services/featureAdminService';

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

export function useSetFeatureOverride(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ featureKey, enabled }: { featureKey: string; enabled: boolean | null }) => {
      if (!tenantId) throw new Error('No studio selected');
      await setFeatureOverride(tenantId, featureKey, enabled);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'feature-states', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['featureGate', tenantId] });
    },
  });
}

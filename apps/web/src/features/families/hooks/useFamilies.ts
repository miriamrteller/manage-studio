import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FamilySchema, type Family } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

// Schema source: SPEC.md Migration 002
// Query list of families for current tenant with pagination
// Create/update/delete mutations with automatic cache invalidation
// All queries filtered by tenant_id (RLS + application logic)

interface UseFamiliesOptions {
  page?: number;
  enabled?: boolean;
}

export function useFamilies({ page = 1, enabled = true }: UseFamiliesOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['families', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');

      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('families')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .range(from, from + PAGE_SIZE - 1)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch families: ${error.message}`);

      // Validate with schema
      return {
        families: (data || []).map(family => FamilySchema.parse(family)),
        total: count || 0,
        page,
        pageSize: PAGE_SIZE,
      };
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (
      newFamilyData: Omit<Family, 'id' | 'created_at'>
    ) => {
      if (!tenant) throw new Error('Tenant not initialized');

      const { data, error } = await supabase
        .from('families')
        .insert([
          {
            ...newFamilyData,
            tenant_id: tenant.id,
          },
        ])
        .select()
        .single();

      if (error) throw new Error(`Failed to create family: ${error.message}`);
      return FamilySchema.parse(data);
    },
    onSuccess: () => {
      // Invalidate all families queries for this tenant
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['families', tenant.id],
        });
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (
      updatedFamily: Partial<Family> & { id: string }
    ) => {
      if (!tenant) throw new Error('Tenant not initialized');

      const { data, error } = await supabase
        .from('families')
        .update(updatedFamily)
        .eq('id', updatedFamily.id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update family: ${error.message}`);
      return FamilySchema.parse(data);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['families', tenant.id],
        });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (familyId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');

      const { error } = await supabase
        .from('families')
        .delete()
        .eq('id', familyId)
        .eq('tenant_id', tenant.id);

      if (error) throw new Error(`Failed to delete family: ${error.message}`);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['families', tenant.id],
        });
      }
    },
  });

  return {
    // Query results
    families: listQuery.data?.families || [],
    total: listQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,

    // Mutations
    createFamily: createMutation.mutate,
    updateFamily: updateMutation.mutate,
    deleteFamily: deleteMutation.mutate,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
}

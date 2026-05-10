import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PersonSchema, type Person } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

// Schema source: SPEC.md Migration 002
// Query list of people for current tenant with pagination
// Create/update/delete mutations with automatic cache invalidation
// All queries filtered by tenant_id (RLS + application logic)

interface UsePeopleOptions {
  page?: number;
  enabled?: boolean;
}

export function usePeople({ page = 1, enabled = true }: UsePeopleOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['people', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('people')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .range(from, from + PAGE_SIZE - 1)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch people: ${error.message}`);

      // Validate with schema
      return {
        people: (data || []).map(person => PersonSchema.parse(person)),
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
      newPersonData: Omit<Person, 'id' | 'created_at' | 'is_minor'>
    ) => {
      if (!tenant) throw new Error('Tenant not initialized');
      
      const { data, error } = await supabase
        .from('people')
        .insert([
          {
            ...newPersonData,
            tenant_id: tenant.id,
          },
        ])
        .select()
        .single();

      if (error) throw new Error(`Failed to create person: ${error.message}`);
      return PersonSchema.parse(data);
    },
    onSuccess: () => {
      // Invalidate all people queries for this tenant
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (
      updatedPerson: Partial<Person> & { id: string }
    ) => {
      if (!tenant) throw new Error('Tenant not initialized');
      
      const { data, error } = await supabase
        .from('people')
        .update(updatedPerson)
        .eq('id', updatedPerson.id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update person: ${error.message}`);
      return PersonSchema.parse(data);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (personId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      
      const { error } = await supabase
        .from('people')
        .delete()
        .eq('id', personId)
        .eq('tenant_id', tenant.id);

      if (error) throw new Error(`Failed to delete person: ${error.message}`);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
    },
  });

  return {
    // Query results
    people: listQuery.data?.people || [],
    total: listQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,

    // Mutations
    createPerson: createMutation.mutate,
    updatePerson: updateMutation.mutate,
    deletePerson: deleteMutation.mutate,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
}

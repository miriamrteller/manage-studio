import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClassService } from '../service';
import { type Class } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 50;

interface UseClassesOptions {
  termId?: string;
  page?: number;
  enabled?: boolean;
  publicOnly?: boolean;  // Query public_classes_by_subdomain view instead of classes table
}

/**
 * useClasses: Fetch and manage classes
 * 
 * Pattern: 
 * - publicOnly=true: Queries public_classes_by_subdomain view (unauthenticated, minimal params)
 * - publicOnly=false: Uses ClassService with auth (authenticated users, full data access)
 * 
 * TanStack Query handles caching and background refetching
 */
export function useClasses({ termId, page = 1, enabled = true, publicOnly = true }: UseClassesOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  // Public classes from view (no auth required, just subdomain)
  const publicQuery = useQuery({
    queryKey: ['public_classes', tenant?.subdomain],
    queryFn: async () => {
      if (!tenant?.subdomain) throw new Error('Tenant subdomain required');
      const { data, error } = await supabase
        .from('public_classes_by_subdomain')
        .select('*')
        .eq('tenant_subdomain', tenant.subdomain);
      
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && publicOnly && !!tenant?.subdomain,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  // Authenticated classes query (full table access for admins)
  const listQuery = useQuery({
    queryKey: ['classes', tenant?.id, page, termId],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.list(tenant, { page, pageSize: PAGE_SIZE, termId });
    },
    enabled: enabled && !publicOnly && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newClass: Partial<Class>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.create(tenant, newClass);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (classData: Partial<Class>) => {
      if (!tenant || !classData.id) throw new Error('Tenant not initialized or missing class ID');
      return ClassService.update(tenant, classData.id, classData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (classId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.delete(tenant, classId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes', tenant?.id] });
    },
  });

  // Select appropriate query based on publicOnly flag
  const activeQuery = publicOnly ? publicQuery : listQuery;
  const classesData = publicOnly 
    ? (activeQuery.data || []) 
    : (activeQuery.data?.classes || []);

  return {
    classes: classesData,
    total: publicOnly ? classesData.length : (listQuery.data?.total || 0),
    pageSize: PAGE_SIZE,
    isLoading: activeQuery.isLoading,
    error: activeQuery.error instanceof Error ? activeQuery.error.message : (activeQuery.error ? 'Unknown error' : null),
    createClass: createMutation.mutate,
    updateClass: updateMutation.mutate,
    deleteClass: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

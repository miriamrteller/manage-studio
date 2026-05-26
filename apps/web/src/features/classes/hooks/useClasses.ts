import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClassService } from '../service';
import { type Class } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_CLASS_SORT,
  sortClasses,
  type ClassSortField,
  type ClassSortOrder,
} from '../utils/sortClasses';

function coerceAge(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePublicClass(row: Record<string, unknown>) {
  return {
    ...row,
    min_age: coerceAge(row.min_age),
    max_age: coerceAge(row.max_age),
  };
}

const PAGE_SIZE = 50;

interface UseClassesOptions {
  termIds?: string[];
  levelIds?: string[];
  statuses?: string[];
  searchQuery?: string;
  page?: number;
  enabled?: boolean;
  publicOnly?: boolean;
  sortField?: ClassSortField;
  sortOrder?: ClassSortOrder;
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
export function useClasses({
  termIds = [],
  levelIds = [],
  statuses = [],
  searchQuery = '',
  page = 1,
  enabled = true,
  publicOnly = true,
  sortField = DEFAULT_CLASS_SORT.field,
  sortOrder = DEFAULT_CLASS_SORT.order,
}: UseClassesOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  // Public classes from function (returns array)
  const publicQuery = useQuery<any[]>({
    queryKey: ['public_classes', tenant?.subdomain, sortField, sortOrder],
    queryFn: async () => {
      if (!tenant?.subdomain) throw new Error('Tenant subdomain required');
      const { data, error } = await supabase.rpc('get_public_classes_by_subdomain', { p_subdomain: tenant.subdomain });
      if (error) throw error;
      const rows = (data || []).map((row: Record<string, unknown>) => normalizePublicClass(row));
      return sortClasses(rows, sortField, sortOrder);
    },
    enabled: enabled && publicOnly && !!tenant?.subdomain,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  // Authenticated classes query (returns object with classes array)
  const listQuery = useQuery<{ classes: Class[]; total: number }>({
    queryKey: ['classes', tenant?.id, page, termIds, levelIds, statuses, searchQuery, sortField, sortOrder],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.list(tenant, {
        page,
        pageSize: PAGE_SIZE,
        termIds,
        levelIds,
        statuses,
        searchQuery,
        sortField,
        sortOrder,
      });
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
  const classesData = publicOnly 
    ? (publicQuery.data || []) 
    : (listQuery.data?.classes || []);

  return {
    classes: classesData,
    total: publicOnly ? classesData.length : (listQuery.data?.total || 0),
    pageSize: PAGE_SIZE,
    isLoading: publicOnly ? publicQuery.isLoading : listQuery.isLoading,
    error: publicOnly 
      ? (publicQuery.error instanceof Error ? publicQuery.error.message : (publicQuery.error ? 'Unknown error' : null))
      : (listQuery.error instanceof Error ? listQuery.error.message : (listQuery.error ? 'Unknown error' : null)),
    createClass: (
      classData: Partial<Class>,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      createMutation.mutate(classData, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    updateClass: (
      classData: Partial<Class>,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      updateMutation.mutate(classData, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    deleteClass: (
      classId: string,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      deleteMutation.mutate(classId, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

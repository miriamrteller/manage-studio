import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TeacherService } from '../service';
import { type Teacher } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

interface UseTeachersOptions {
  page?: number;
  enabled?: boolean;
}

/**
 * useTeachers: Fetch and manage teachers
 * 
 * Pattern: useQuery for reads + useMutation for writes + cache invalidation
 * TanStack Query handles caching and background refetching
 */
export function useTeachers({ page = 1, enabled = true }: UseTeachersOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['teachers', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TeacherService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newTeacher: Partial<Teacher>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TeacherService.create(tenant, newTeacher);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (teacherData: Partial<Teacher>) => {
      if (!tenant || !teacherData.id) throw new Error('Tenant not initialized or missing teacher ID');
      return TeacherService.update(tenant, teacherData.id, teacherData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (teacherId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TeacherService.delete(tenant, teacherId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers', tenant?.id] });
    },
  });

  return {
    teachers: listQuery.data?.teachers || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : 'Unknown error',
    createTeacher: createMutation.mutate,
    updateTeacher: updateMutation.mutate,
    deleteTeacher: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

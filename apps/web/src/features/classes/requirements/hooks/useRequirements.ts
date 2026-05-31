import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RequirementService,
  RequirementTemplateService,
} from '../service';
import { useTenant } from '@/hooks/useTenant';
import type { RequirementTemplate } from '@shared/schemas';

// ── Templates (tenant library) ────────────────────────────────────────────────

export function useRequirementTemplates(enabled = true) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['requirement_templates', tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementTemplateService.list(tenant);
    },
    enabled: enabled && !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<RequirementTemplate>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementTemplateService.create(tenant, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirement_templates', tenant?.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementTemplateService.delete(tenant, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirement_templates', tenant?.id] });
    },
  });

  return {
    templates: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : null,
    createTemplate: createMutation.mutate,
    deleteTemplate: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ── Per-class requirements (link rows + joined template) ──────────────────────

export function useRequirements(classId: string | undefined, enabled = true) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['offering_requirements', tenant?.id, classId],
    queryFn: async () => {
      if (!tenant || !classId) throw new Error('Tenant or classId missing');
      return RequirementService.list(tenant, classId);
    },
    enabled: enabled && !!tenant?.id && !!classId,
  });

  const linkMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!tenant || !classId) throw new Error('Tenant or classId missing');
      return RequirementService.linkTemplate(tenant, classId, templateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offering_requirements', tenant?.id, classId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (requirementId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementService.delete(tenant, requirementId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offering_requirements', tenant?.id, classId] });
    },
  });

  return {
    requirements: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : null,
    linkTemplate: linkMutation.mutate,
    deleteRequirement: deleteMutation.mutate,
    isLinking: linkMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

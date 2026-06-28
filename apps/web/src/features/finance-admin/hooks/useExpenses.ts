import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import type { ExpenseCategory } from '@shared/schemas';
import {
  ExpenseService,
  ExpenseCategoryService,
  EXPENSES_PAGE_SIZE,
  type ExpensesListFilters,
} from '../services/expenseService';

export function useExpenses({
  page = 1,
  filters = {},
  enabled = true,
}: {
  page?: number;
  filters?: ExpensesListFilters;
  enabled?: boolean;
} = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['expenses', tenant?.id, page, filters],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ExpenseService.list(tenant, { page, filters });
    },
    enabled: enabled && !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      input: Parameters<typeof ExpenseService.createExpense>[1];
      receiptPath?: string | null;
    }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ExpenseService.createExpense(tenant, params.input, params.receiptPath);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary', tenant?.id] });
    },
  });

  return {
    expenses: listQuery.data?.rows ?? [],
    totalCount: listQuery.data?.totalCount ?? 0,
    page: listQuery.data?.page ?? page,
    pageSize: listQuery.data?.pageSize ?? EXPENSES_PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createExpense: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    refetch: listQuery.refetch,
  };
}

export function useExpenseCategories(enabled = true) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['expense-categories', tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ExpenseCategoryService.list(tenant);
    },
    enabled: enabled && !!tenant?.id,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['expense-categories', tenant?.id] });

  const createMutation = useMutation({
    mutationFn: async (input: Partial<ExpenseCategory>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ExpenseCategoryService.create(tenant, input);
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ExpenseCategory> }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ExpenseCategoryService.update(tenant, id, input);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ExpenseCategoryService.delete(tenant, id);
    },
    onSuccess: invalidate,
  });

  return {
    categories: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createCategory: (
      input: Partial<ExpenseCategory>,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void },
    ) => createMutation.mutate(input, callbacks),
    createCategoryAsync: async (input: Partial<ExpenseCategory>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return createMutation.mutateAsync(input);
    },
    updateCategory: (
      params: { id: string; input: Partial<ExpenseCategory> },
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void },
    ) => updateMutation.mutate(params, callbacks),
    deleteCategory: (
      id: string,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void },
    ) => deleteMutation.mutate(id, callbacks),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

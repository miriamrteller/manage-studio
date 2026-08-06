import { useState, useCallback } from 'react';

interface UseOptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  optimisticUpdateFn: (variables: TVariables, currentData?: TData) => TData;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  rollbackFn?: (previousData: TData) => void;
}

interface MutationState<TData> {
  data: TData | undefined;
  isOptimistic: boolean;
  isPending: boolean;
  error: Error | null;
}

interface UseOptimisticMutationResult<TData, TVariables> {
  mutate: (variables: TVariables, currentData?: TData) => Promise<void>;
  isPending: boolean;
  isOptimistic: boolean;
  error: Error | null;
  data: TData | undefined;
  reset: () => void;
}

export function useOptimisticMutation<TData, TVariables>(
  options: UseOptimisticMutationOptions<TData, TVariables>
): UseOptimisticMutationResult<TData, TVariables> {
  const { mutationFn, optimisticUpdateFn, onSuccess, onError, rollbackFn } = options;

  const [state, setState] = useState<MutationState<TData>>({
    data: undefined,
    isOptimistic: false,
    isPending: false,
    error: null,
  });

  const mutate = useCallback(
    async (variables: TVariables, currentData?: TData): Promise<void> => {
      const previousData = currentData ?? state.data;

      // Apply optimistic update immediately
      const optimisticData = optimisticUpdateFn(variables, previousData);
      setState({
        data: optimisticData,
        isOptimistic: true,
        isPending: true,
        error: null,
      });

      try {
        // Perform the actual mutation
        const result = await mutationFn(variables);

        // Update with real data from server
        setState({
          data: result,
          isOptimistic: false,
          isPending: false,
          error: null,
        });

        // Call success callback
        onSuccess?.(result, variables);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Rollback to previous data
        setState({
          data: previousData,
          isOptimistic: false,
          isPending: false,
          error,
        });

        // Call rollback function if provided
        if (previousData !== undefined) {
          rollbackFn?.(previousData);
        }

        // Call error callback
        onError?.(error, variables);
      }
    },
    [mutationFn, optimisticUpdateFn, onSuccess, onError, rollbackFn, state.data]
  );

  const reset = useCallback(() => {
    setState({
      data: undefined,
      isOptimistic: false,
      isPending: false,
      error: null,
    });
  }, []);

  return {
    mutate,
    isPending: state.isPending,
    isOptimistic: state.isOptimistic,
    error: state.error,
    data: state.data,
    reset,
  };
}

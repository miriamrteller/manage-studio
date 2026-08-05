import { useCallback, useEffect, useRef, useState } from 'react';

export interface OptimisticState<T> {
  data: T;
  isOptimistic: boolean;
  error?: Error;
}

export interface UseOptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Produces the value to show immediately, before the server confirms. */
  optimisticUpdateFn: (variables: TVariables, currentData?: TData) => TData;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables, context?: unknown) => void;
  onSettled?: (data?: TData, error?: Error, variables?: TVariables) => void;
  /** Called with the pre-mutation value after a failed mutation is rolled back. */
  rollbackFn?: (previousData: TData) => void;
}

/**
 * useOptimisticMutation: applies an optimistic value straight away and rolls
 * back to the previous value if the mutation rejects.
 *
 * Implementation notes
 * - Callbacks and `mutationFn` are read through a ref, so `mutate` keeps a
 *   stable identity even when callers pass a fresh options object literal
 *   every render (the common case). Without this, `mutate` would change on
 *   every render and defeat memoisation in consumers.
 * - `onSettled` receives the values resolved by *this* invocation rather than
 *   whatever is in state at the time, which would be a render behind.
 * - State writes are skipped after unmount so a slow request cannot warn or
 *   resurrect a dead component.
 *
 * Accessibility: pair `error` with a live region (or the Toast component's
 * error variant) so failures and rollbacks are announced, not just repainted.
 */
export function useOptimisticMutation<TData, TVariables>(
  options: UseOptimisticMutationOptions<TData, TVariables>,
) {
  const [state, setState] = useState<OptimisticState<TData | undefined>>({
    data: undefined,
    isOptimistic: false,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutate = useCallback(async (variables: TVariables, currentData?: TData): Promise<TData> => {
    const {
      mutationFn,
      optimisticUpdateFn,
      onSuccess,
      onError,
      onSettled,
      rollbackFn,
    } = optionsRef.current;

    const previousData = currentData;
    const optimisticData = optimisticUpdateFn(variables, currentData);

    if (mountedRef.current) {
      setState({ data: optimisticData, isOptimistic: true });
    }

    try {
      const result = await mutationFn(variables);

      if (mountedRef.current) {
        setState({ data: result, isOptimistic: false, error: undefined });
      }

      onSuccess?.(result, variables);
      onSettled?.(result, undefined, variables);
      return result;
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));

      if (mountedRef.current) {
        setState({ data: previousData, isOptimistic: false, error });
      }

      if (previousData !== undefined) {
        rollbackFn?.(previousData);
      }

      onError?.(error, variables, previousData);
      onSettled?.(previousData, error, variables);
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    if (!mountedRef.current) return;
    setState({ data: undefined, isOptimistic: false, error: undefined });
  }, []);

  return {
    mutate,
    reset,
    data: state.data,
    isOptimistic: state.isOptimistic,
    error: state.error,
    isPending: state.isOptimistic,
    isError: state.error !== undefined,
  };
}

export default useOptimisticMutation;

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFeedback, setFeedbackStatus, type FeedbackStatus } from '../services/feedbackAdminService';

const KEY = ['platform', 'feedback'] as const;

export function useFeedback() {
  return useQuery({ queryKey: KEY, queryFn: fetchFeedback, staleTime: 30 * 1000 });
}

export function useSetFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) => setFeedbackStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

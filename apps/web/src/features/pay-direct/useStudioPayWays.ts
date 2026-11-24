import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { PayDirectService, type StudioPayWays } from './payDirectService';

/** The studio's ways to be paid directly (Settings › Online payments), for every checkout. */
export function useStudioPayWays() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const key = ['studio-pay-ways', tenant?.id] as const;
  const ways = useQuery({
    queryKey: key,
    queryFn: () => PayDirectService.getStudioWays(tenant!.id),
    enabled: Boolean(tenant?.id),
  });
  const save = useMutation({
    mutationFn: (values: StudioPayWays) => PayDirectService.saveStudioWays(tenant!.id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { ways, save };
}

import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { fetchClassCardSettings } from '../service';

/** True once the studio admin has switched class cards on (false while loading or on error). */
export function useClassCardsEnabled(): boolean {
  const tenant = useTenant();
  const settings = useQuery({
    queryKey: ['class-cards', 'settings', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => fetchClassCardSettings(tenant!.id),
  });
  return settings.data?.enabled === true;
}

import { useQuery } from '@tanstack/react-query';
import { BookingService, type BookableOffering } from '@/features/scheduling/bookingService';
import { useTenant } from '@/hooks/useTenant';

/** The studio's bookable services/packages for the public homepage. Empty when booking is off. */
export function useBookableOfferings(enabled: boolean): { offerings: BookableOffering[]; isLoading: boolean } {
  const tenant = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ['home-bookable', tenant?.subdomain],
    enabled: enabled && Boolean(tenant?.subdomain),
    staleTime: 5 * 60 * 1000,
    queryFn: () => BookingService.listBookableOfferings(tenant!.subdomain),
  });
  return { offerings: data ?? [], isLoading: enabled && isLoading };
}

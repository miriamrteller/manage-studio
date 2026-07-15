import { useQuery } from '@tanstack/react-query';
import { BookingService, type AvailableSlot } from '../bookingService';

/**
 * Loads bookable slots for the FullCalendar visible window (or a single day).
 * Refetches when the offering or date range changes.
 */
export function useAvailableSlots(
  subdomain: string,
  offeringId: string | null,
  range: { startDate: string; endDate: string } | null,
) {
  return useQuery<AvailableSlot[]>({
    queryKey: [
      'availableSlots',
      subdomain,
      offeringId,
      range?.startDate,
      range?.endDate,
    ],
    queryFn: () =>
      BookingService.getAvailableSlots(subdomain, offeringId!, {
        startDate: range!.startDate,
        endDate: range!.endDate,
      }),
    enabled: !!subdomain && !!offeringId && !!range,
    staleTime: 30 * 1000,
  });
}

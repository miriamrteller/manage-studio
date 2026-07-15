import { useQuery } from '@tanstack/react-query';
import { BookingService, type AvailableSlot } from '../bookingService';

/** Matches get-available-slots max inclusive range; covers default booking_window_days. */
const SEARCH_DAYS = 61;

function jerusalemDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addIsoDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Earliest bookable slot for an offering from today forward (within the edge
 * function’s range cap). Used to open the booking calendar on a useful day and
 * power the “Next available” toolbar button.
 */
export function useNextAvailableSlot(subdomain: string, offeringId: string | null) {
  return useQuery<AvailableSlot | null>({
    queryKey: ['nextAvailableSlot', subdomain, offeringId],
    queryFn: async () => {
      const startDate = jerusalemDate(new Date());
      const endDate = addIsoDays(startDate, SEARCH_DAYS);
      const slots = await BookingService.getAvailableSlots(subdomain, offeringId!, {
        startDate,
        endDate,
      });
      return slots[0] ?? null;
    },
    enabled: !!subdomain && !!offeringId,
    staleTime: 30 * 1000,
  });
}

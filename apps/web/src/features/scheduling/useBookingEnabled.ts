import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { BookingSettingsService } from './bookingSettingsService';

/**
 * Whether the tenant has online booking turned on in Booking Settings.
 *
 * Returns undefined while unknown. tenant_scheduling_settings is only readable
 * by tenant admins (RLS), so for other users this stays undefined and callers
 * should not restrict anything — the booking page itself degrades gracefully.
 *
 * Shares the ['bookingSettings', id] cache entry (bare BookingSettings shape)
 * with BookingServicesPage; BookingSettingsPage invalidates it on save.
 */
export function useBookingEnabled(): boolean | undefined {
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const isTenantAdmin = user?.role?.includes('tenant_admin') ?? false;

  const query = useQuery({
    queryKey: ['bookingSettings', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      return BookingSettingsService.getSettings(tenant as never);
    },
    enabled: !!tenant?.id && isTenantAdmin,
  });

  return query.data?.is_booking_enabled;
}

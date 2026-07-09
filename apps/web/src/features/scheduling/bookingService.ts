import { supabase } from '@/lib/supabase';

export interface BookableOffering {
  id: string;
  name: string;
  duration_mins: number | null;
  price_minor: number;
  currency: string;
  location: string | null;
}

export interface AvailableSlot {
  starts_at: string;
  ends_at: string;
}

export interface PrepareBookingResult {
  engagement_id: string;
  hold_id: string;
  token: string;
  redirect_path: string;
}

/**
 * Public booking client. Availability + holds run through SECURITY DEFINER RPCs;
 * checkout bootstrap runs through the prepare-booking-checkout Edge Function,
 * which reuses the existing enrolment payment/finalise spine.
 */
export const BookingService = {
  async listBookableOfferings(subdomain: string): Promise<BookableOffering[]> {
    const { data, error } = await supabase.rpc('get_bookable_offerings_by_subdomain', {
      p_subdomain: subdomain,
    });
    if (error) throw error;
    return (data ?? []) as BookableOffering[];
  },

  /**
   * Slots go through the get-available-slots Edge Function, which layers Google
   * Calendar free/busy on top of the DB availability RPC when the tenant is
   * connected (fail-closed on calendar errors).
   */
  async getAvailableSlots(
    subdomain: string,
    offeringId: string,
    date: string,
  ): Promise<AvailableSlot[]> {
    const { data, error } = await supabase.functions.invoke('get-available-slots', {
      body: { subdomain, offering_id: offeringId, date },
    });
    if (error) throw error;
    return ((data as { slots?: AvailableSlot[] })?.slots ?? []) as AvailableSlot[];
  },

  async createHold(params: {
    subdomain: string;
    offeringId: string;
    startsAt: string;
    endsAt: string;
    clientName: string;
    clientEmail: string;
    clientPhone?: string | null;
  }): Promise<{ hold_id: string; expires_at: string }> {
    const { data, error } = await supabase.rpc('create_scheduling_hold', {
      p_subdomain: params.subdomain,
      p_offering_id: params.offeringId,
      p_starts_at: params.startsAt,
      p_ends_at: params.endsAt,
      p_client_name: params.clientName,
      p_client_email: params.clientEmail,
      p_client_phone: params.clientPhone ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row as { hold_id: string; expires_at: string };
  },

  async releaseHold(holdId: string): Promise<void> {
    await supabase.rpc('release_scheduling_hold', { p_hold_id: holdId });
  },

  async prepareCheckout(params: {
    subdomain: string;
    holdId: string;
    clientName: string;
    clientEmail: string;
    clientPhone?: string | null;
  }): Promise<PrepareBookingResult> {
    const { data, error } = await supabase.functions.invoke('prepare-booking-checkout', {
      body: {
        subdomain: params.subdomain,
        hold_id: params.holdId,
        client_name: params.clientName,
        client_email: params.clientEmail,
        client_phone: params.clientPhone ?? null,
      },
    });
    if (error) throw error;
    return data as PrepareBookingResult;
  },
};

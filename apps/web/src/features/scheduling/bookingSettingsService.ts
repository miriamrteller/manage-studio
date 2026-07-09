import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';

export interface BookingSettings {
  tenant_id?: string;
  buffer_mins: number;
  slot_duration_mins: number;
  max_per_day: number | null;
  advance_notice_hrs: number;
  booking_window_days: number;
  hold_expiry_mins: number;
  expiry_reminder_mins: number | null;
  is_booking_enabled: boolean;
}

export interface BookingHours {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface BookableOffering {
  id: string;
  name: string;
  duration_mins: number | null;
  price_minor: number;
  currency: string;
  is_bookable: boolean;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  buffer_mins: 0,
  slot_duration_mins: 60,
  max_per_day: null,
  advance_notice_hrs: 24,
  booking_window_days: 60,
  hold_expiry_mins: 20,
  expiry_reminder_mins: null,
  is_booking_enabled: false,
};

export const HOLD_EXPIRY_OPTIONS = [15, 20, 25, 30, 45, 60, 90, 120] as const;
export const EXPIRY_REMINDER_OPTIONS = [5, 10, 15] as const;

export class BookingSettingsService extends BaseService {
  static async getSettings(tenant: Tenant): Promise<BookingSettings> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('tenant_scheduling_settings')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...DEFAULT_BOOKING_SETTINGS };
      return data as BookingSettings;
    }, 'BookingSettingsService.getSettings');
  }

  static async saveSettings(tenant: Tenant, values: BookingSettings): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await supabase
        .from('tenant_scheduling_settings')
        .upsert(
          { ...values, tenant_id: tenant.id, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id' },
        );
      if (error) throw error;
    }, 'BookingSettingsService.saveSettings');
  }

  static async getHours(tenant: Tenant): Promise<BookingHours[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('tenant_scheduling_hours', tenant)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookingHours[];
    }, 'BookingSettingsService.getHours');
  }

  /** Replace-all: remove existing hours then insert the new set. */
  static async saveHours(tenant: Tenant, hours: BookingHours[]): Promise<void> {
    return this.withRetry(async () => {
      const { error: delError } = await supabase
        .from('tenant_scheduling_hours')
        .delete()
        .eq('tenant_id', tenant.id);
      if (delError) throw delError;

      if (hours.length === 0) return;
      const rows = hours.map((h) => ({
        tenant_id: tenant.id,
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
        is_active: h.is_active,
      }));
      const { error: insError } = await supabase.from('tenant_scheduling_hours').insert(rows);
      if (insError) throw insError;
    }, 'BookingSettingsService.saveHours');
  }

  static async getBookableOfferings(tenant: Tenant): Promise<BookableOffering[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('offerings', tenant)
        .eq('status', 'active')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((o: Record<string, unknown>) => ({
        id: o.id as string,
        name: o.name as string,
        duration_mins: (o.duration_mins as number | null) ?? null,
        price_minor: (o.price_minor as number) ?? 0,
        currency: (o.currency as string) ?? 'ILS',
        is_bookable: Boolean(o.is_bookable),
      }));
    }, 'BookingSettingsService.getBookableOfferings');
  }

  static async setOfferingBookable(
    tenant: Tenant,
    offeringId: string,
    isBookable: boolean,
    durationMins: number | null,
  ): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await TenantDB.update('offerings', tenant, offeringId, {
        is_bookable: isBookable,
        duration_mins: durationMins,
      });
      if (error) throw error;
    }, 'BookingSettingsService.setOfferingBookable');
  }
}

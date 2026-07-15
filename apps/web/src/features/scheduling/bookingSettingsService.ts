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

  /** Replace-all hours in one DB transaction (delete + insert). */
  static async saveHours(_tenant: Tenant, hours: BookingHours[]): Promise<void> {
    return this.withRetry(async () => {
      const payload = hours.map((h) => ({
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
        is_active: h.is_active,
      }));
      const { error } = await supabase.rpc('replace_tenant_scheduling_hours', {
        p_hours: payload,
      });
      if (error) throw error;
    }, 'BookingSettingsService.saveHours');
  }

}

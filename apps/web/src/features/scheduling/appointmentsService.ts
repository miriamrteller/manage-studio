import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';
import {
  resolveAppointmentPenalty,
  type AppointmentCloseAction,
} from '@/features/scheduling/lib/resolveAppointmentPenalty';
import type { BookingSettings } from '@/features/scheduling/bookingSettingsService';

export interface AppointmentRow {
  id: string;
  status: string;
  booked_starts_at: string;
  booked_ends_at: string;
  google_event_id: string | null;
  payment_received_at: string | null;
  cancellation_reason: string | null;
  penalty_applied_at: string | null;
  offering_name: string | null;
  client_name: string | null;
  client_email: string | null;
}

export class AppointmentsService extends BaseService {
  static async list(tenant: Tenant): Promise<AppointmentRow[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('engagements')
        .select(
          'id, status, booked_starts_at, booked_ends_at, google_event_id, payment_received_at, cancellation_reason, penalty_applied_at, offerings(name), people(name, email)',
        )
        .eq('tenant_id', tenant.id)
        .not('booked_starts_at', 'is', null)
        .order('booked_starts_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => {
        const offering = row.offerings as { name?: string } | null;
        const person = row.people as { name?: string; email?: string } | null;
        return {
          id: row.id as string,
          status: row.status as string,
          booked_starts_at: row.booked_starts_at as string,
          booked_ends_at: row.booked_ends_at as string,
          google_event_id: (row.google_event_id as string | null) ?? null,
          payment_received_at: (row.payment_received_at as string | null) ?? null,
          cancellation_reason: (row.cancellation_reason as string | null) ?? null,
          penalty_applied_at: (row.penalty_applied_at as string | null) ?? null,
          offering_name: offering?.name ?? null,
          client_name: person?.name ?? null,
          client_email: person?.email ?? null,
        };
      });
    }, 'AppointmentsService.list');
  }

  /**
   * Close an appointment (cancel or no-show).
   * When `penaltiesEnabled`, applies late-cancel / no-show reason + optional retained-payment marker.
   */
  static async close(
    tenant: Tenant,
    row: AppointmentRow,
    action: AppointmentCloseAction,
    options: { penaltiesEnabled: boolean; settings: BookingSettings | null },
  ): Promise<void> {
    return this.withRetry(async () => {
      let cancellation_reason = 'admin_cancelled';
      let penalty_applied_at: string | null = null;

      if (options.penaltiesEnabled && options.settings) {
        const resolved = resolveAppointmentPenalty({
          action,
          bookedStartsAt: row.booked_starts_at,
          lateCancelHours: options.settings.late_cancel_hours,
          retainPaymentOnPenalty: options.settings.retain_payment_on_penalty,
          wasPaid: Boolean(row.payment_received_at) || row.status === 'active' || row.status === 'pending_waiver',
        });
        cancellation_reason = resolved.cancellation_reason;
        penalty_applied_at = resolved.penalty_applied_at;
      } else if (action === 'no_show') {
        cancellation_reason = 'no_show';
      }

      const { error } = await TenantDB.update('engagements', tenant, row.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason,
        penalty_applied_at,
      });
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'engagements', row.id);

      try {
        await supabase.functions.invoke('google-calendar-sync-event', {
          body: { engagement_id: row.id, action: 'delete' },
        });
      } catch (e) {
        console.warn('[AppointmentsService.close] gcal delete failed', e);
      }
    }, 'AppointmentsService.close');
  }

  /** @deprecated Prefer `close` — kept for call sites that only need plain cancel. */
  static async cancel(tenant: Tenant, id: string): Promise<void> {
    const rows = await this.list(tenant);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error('Appointment not found');
    return this.close(tenant, row, 'cancel', { penaltiesEnabled: false, settings: null });
  }
}

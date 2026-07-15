import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';

export interface AppointmentRow {
  id: string;
  status: string;
  booked_starts_at: string;
  booked_ends_at: string;
  google_event_id: string | null;
  offering_name: string | null;
  client_name: string | null;
  client_email: string | null;
}

export class AppointmentsService extends BaseService {
  static async list(tenant: Tenant): Promise<AppointmentRow[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('engagements')
        .select('id, status, booked_starts_at, booked_ends_at, google_event_id, offerings(name), people(name, email)')
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
          offering_name: offering?.name ?? null,
          client_name: person?.name ?? null,
          client_email: person?.email ?? null,
        };
      });
    }, 'AppointmentsService.list');
  }

  static async cancel(tenant: Tenant, id: string): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await TenantDB.update('engagements', tenant, id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'admin_cancelled',
      });
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'engagements', id);

      // Remove the Google Calendar event if one was synced (best-effort, non-blocking).
      try {
        await supabase.functions.invoke('google-calendar-sync-event', {
          body: { engagement_id: id, action: 'delete' },
        });
      } catch (e) {
        console.warn('[AppointmentsService.cancel] gcal delete failed', e);
      }
    }, 'AppointmentsService.cancel');
  }
}

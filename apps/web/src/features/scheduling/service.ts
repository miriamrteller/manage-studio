import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';
import type { ScheduleEvent, SchedulingBlock } from './types';

/**
 * ScheduleService: read-only timetable feed + blocked-time CRUD.
 *
 * Events are computed server-side (get_schedule_events RPC) from offerings,
 * offering_sessions, blocks, and (from S2) booked appointments. There is no
 * projection table — the RPC aggregates on read in Asia/Jerusalem.
 */
export class ScheduleService extends BaseService {
  static async listEvents(
    tenant: Tenant,
    range: { start: Date; end: Date },
  ): Promise<ScheduleEvent[]> {
    if (!tenant?.id) throw new Error('Tenant ID required');

    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('get_schedule_events', {
        p_tenant_id: tenant.id,
        p_start: range.start.toISOString(),
        p_end: range.end.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as ScheduleEvent[];
    }, 'ScheduleService.listEvents');
  }

  static async createBlock(
    tenant: Tenant,
    block: { summary: string; start_time: string; end_time: string },
  ): Promise<SchedulingBlock> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('scheduling_blocks', tenant, block)
        .select()
        .single();
      if (error) throw error;
      await this.logAudit(tenant, 'CREATE', 'scheduling_blocks', data.id);
      return data as SchedulingBlock;
    }, 'ScheduleService.createBlock');
  }

  static async deleteBlock(tenant: Tenant, id: string): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('scheduling_blocks', tenant, id);
      if (error) throw error;
      await this.logAudit(tenant, 'DELETE', 'scheduling_blocks', id);
    }, 'ScheduleService.deleteBlock');
  }
}

import { supabase } from '@/lib/supabase';
import { BaseService } from '@/services/base.service';
import { AdminDashboardOverviewSchema } from '@shared/schemas';
import type { AdminDashboardOverview } from '@shared/schemas';

/**
 * Thrown when a tenant has no active season.
 * SQLSTATE P0001 from get_admin_dashboard_overview().
 * Client should render a "No active season" UI state — not a generic error.
 */
export class NoActiveSeasonError extends Error {
  readonly code = 'NO_ACTIVE_SEASON' as const;

  constructor(message = 'No active season found for this tenant') {
    super(message);
    this.name = 'NoActiveSeasonError';
  }
}

export class AdminDashboardService extends BaseService {
  /**
   * Non-retryable: NoActiveSeasonError is a permanent business-logic state,
   * not a transient failure. Retrying will always produce the same result.
   */
  protected static override isNonRetryableError(error: Error): boolean {
    if (error instanceof NoActiveSeasonError) return true;
    return super.isNonRetryableError(error);
  }

  static async getOverview(): Promise<AdminDashboardOverview> {
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('get_admin_dashboard_overview');

      if (error) {
        // P0001 = no active season (RAISE EXCEPTION USING ERRCODE = 'P0001')
        if (error.code === 'P0001') {
          throw new NoActiveSeasonError(error.message);
        }
        throw error;
      }

      return AdminDashboardOverviewSchema.parse(data);
    }, 'AdminDashboardService.getOverview');
  }
}

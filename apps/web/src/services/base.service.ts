import type { Tenant } from '@shared/schemas';
import type { PostgrestError } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { supabase } from '@/lib/supabase';

/**
 * BaseService: Shared error handling, retry logic, audit logging
 * All feature services (LevelService, PersonService, etc.) extend this.
 */
export abstract class BaseService {
  protected static readonly MAX_RETRIES = 3;
  protected static readonly RETRY_DELAY_MS = 1000;

  /**
   * Retry wrapper for transient failures (network, timeouts).
   * Does NOT retry auth/RLS errors — those are permanent.
   */
  protected static isNonRetryableError(error: Error): boolean {
    if (error instanceof ZodError) return true;

    const msg = error.message.toLowerCase();
    if (msg.includes('permission denied') || msg.includes('jwt')) return true;
    if (msg.includes('already enrolled')) return true;
    if (msg.includes('not eligible')) return true;
    if (msg.includes('only admins can override')) return true;
    if (msg.includes('not found')) return true;

    return false;
  }

  protected static async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (this.isNonRetryableError(err)) {
          throw err;
        }

        lastError = err;

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < this.MAX_RETRIES - 1) {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${this.MAX_RETRIES} retries: ${lastError?.message}`
    );
  }

  /**
   * Parse Supabase error into user-friendly message.
   * Maps cryptic PG errors to actionable messages.
   */
  protected static parseError(error: PostgrestError | Error): string {
    if (!(error instanceof Error)) return 'Unknown error';

    const msg = error.message.toLowerCase();

    if (msg.includes('permission denied')) {
      return 'You do not have permission to perform this action';
    }
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return 'Cannot delete this item — it is used by other records';
    }
    if (msg.includes('duplicate')) {
      return 'This item already exists';
    }
    if (msg.includes('no rows')) {
      return 'Item not found';
    }
    if (msg.includes('network') || msg.includes('timeout')) {
      return 'Network error — please try again';
    }

    return error.message || 'An unexpected error occurred';
  }

  /**
   * Audit log helper (optional — implement if audit_log table exists).
   * Logs mutations for compliance/debugging.
   */
  protected static async logAudit(
    tenant: Tenant,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    table: string,
    recordId: string
  ): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    const actorId = userData.user?.id;
    if (!actorId) return;

    const { error } = await supabase.from('audit_log').insert({
      tenant_id: tenant.id,
      actor_id: actorId,
      action,
      entity_type: table,
      entity_id: recordId,
    });

    if (error) {
      console.warn('[Audit] failed to write audit_log:', error.message);
    }
  }
}

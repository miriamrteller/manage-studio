import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { EnrolmentSchema, type Enrolment } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';

// Validation schema for enrolment creation/update (without system fields)
const EnrolmentInputSchema = z.object({
  person_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  term_id: z.string().uuid().optional(),
  status: z
    .enum(['pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn'])
    .optional(),
  billing_account_id: z.string().uuid().nullable().optional(),
  payment_received_at: z.string().nullable().optional(),
});

/**
 * EnrolmentService: All enrolment data operations
 * - Validates input/output with EnrolmentSchema
 * - Uses TenantDB for RLS enforcement
 * - Inherits retry logic from BaseService
 * 
 * Enrolment is the most complex module: handles person→class→term relationships
 * with status tracking (active, pending_payment, cancelled, withdrawn, waitlisted)
 */
export class EnrolmentService extends BaseService {
  static async list(
    tenant: Tenant,
    options: {
      page?: number;
      pageSize?: number;
      termId?: string;
      personId?: string;
      status?: string;
    } = {}
  ) {
    const { page = 1, pageSize = 20, termId, personId, status } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('enrolments', tenant, {
        count: 'exact',
      });

      if (termId) {
        query = query.eq('term_id', termId);
      }
      if (personId) {
        query = query.eq('person_id', personId);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      return {
        enrolments: (data || []).map(e => EnrolmentSchema.parse(e)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'EnrolmentService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('enrolments', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Enrolment not found');

      return EnrolmentSchema.parse(data);
    }, 'EnrolmentService.get');
  }

  /**
   * Create new enrolment
   * V1: Simple create without placement scoring
   * V2: Will add prerequisite validation, waiting list logic
   */
  static async create(tenant: Tenant, enrolmentData: Partial<Enrolment>) {
    // Validate input (catches client-side typos)
    const validated = EnrolmentInputSchema.parse(enrolmentData);

    return this.withRetry(async () => {
      // Check for duplicate enrolment (same person+class+term)
      if (validated.person_id && validated.class_id && validated.term_id) {
        const { data: existing, error: checkError } = await TenantDB.selectFor('enrolments', tenant)
          .eq('person_id', validated.person_id)
          .eq('class_id', validated.class_id)
          .eq('term_id', validated.term_id)
          .maybeSingle();

        if (checkError) throw checkError;
        if (existing) throw new Error('Person already enrolled in this class for this term');
      }

      const { data, error } = await TenantDB.insert('enrolments', tenant, validated)
        .select()
        .single();

      if (error) throw error;

      const result = EnrolmentSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'enrolments', result.id);
      return result;
    }, 'EnrolmentService.create');
  }

  /**
   * Update enrolment
   * Primarily for status transitions (active→cancelled, pending_payment→active, etc)
   */
  static async update(tenant: Tenant, id: string, enrolmentData: Partial<Enrolment>) {
    const validated = EnrolmentInputSchema.parse(enrolmentData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('enrolments', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = EnrolmentSchema.parse(data);
      await this.logAudit(tenant, 'UPDATE', 'enrolments', id);
      return result;
    }, 'EnrolmentService.update');
  }

  /**
   * Delete enrolment (typically soft delete via status change)
   * Can be hard delete if needed for cleanup
   */
  static async delete(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { error } = await TenantDB.delete('enrolments', tenant, id);
      if (error) throw error;

      await this.logAudit(tenant, 'DELETE', 'enrolments', id);
    }, 'EnrolmentService.delete');
  }

  /**
   * Get enrolments by status (helper for filtering)
   * Used for dashboard summaries: pending_payment, waitlisted, etc
   */
  static async listByStatus(
    tenant: Tenant,
    targetStatus: string,
    options: { page?: number; pageSize?: number } = {}
  ) {
    return this.list(tenant, {
      page: options.page,
      pageSize: options.pageSize,
      status: targetStatus,
    });
  }
}

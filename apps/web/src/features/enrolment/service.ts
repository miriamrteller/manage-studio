import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { EngagementSchema, type Engagement } from '@shared/schemas';
import { z } from 'zod';
import type { Tenant } from '@shared/schemas';
import { NON_TERMINAL_ENGAGEMENT_STATUSES } from './lib/enrolmentTransitions';
import { isAgeEligible } from './lib/check-requirements';

const EnrolmentStatusSchema = z.enum([
  'pending_payment',
  'active',
  'admin_review',
  'pending_offer',
  'cancelled',
  'withdrawn',
]);

// Validation schema for enrolment creation/update (without system fields)
const EnrolmentInputSchema = z
  .object({
    person_id: z.string().uuid().optional(),
    offering_id: z.string().uuid().optional(),
    season_id: z.string().uuid().optional(),
    status: EnrolmentStatusSchema.optional(),
    billing_account_id: z.string().uuid().nullable().optional(),
    payment_received_at: z.string().nullable().optional(),
    age_override_confirmed: z.boolean().optional(),
    age_override_reason: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => data.status == null || !['cancelled', 'withdrawn'].includes(data.status),
    { message: 'Use cancel_engagement RPC for cancellation or withdrawal' },
  );

export type EnrolmentCreateInput = Partial<Engagement> & {
  age_override_confirmed?: boolean;
  age_override_reason?: string | null;
};

/**
 * EnrolmentService: All enrolment data operations
 * - Validates input/output with EngagementSchema
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
      seasonId?: string;
      personId?: string;
      status?: string;
    } = {}
  ) {
    const { page = 1, pageSize = 20, seasonId, personId, status } = options;
    const from = (page - 1) * pageSize;

    return this.withRetry(async () => {
      let query = TenantDB.selectFor('engagements', tenant, {
        count: 'exact',
      });

      if (seasonId) {
        query = query.eq('season_id', seasonId);
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
        enrolments: (data || []).map(e => EngagementSchema.parse(e)),
        total: count || 0,
        page,
        pageSize,
      };
    }, 'EnrolmentService.list');
  }

  static async get(tenant: Tenant, id: string) {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('engagements', tenant)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Enrolment not found');

      return EngagementSchema.parse(data);
    }, 'EnrolmentService.get');
  }

  /**
   * Create new enrolment
   * V1: Simple create without placement scoring
   * V2: Will add prerequisite validation, waiting list logic
   */
  static async create(tenant: Tenant, enrolmentData: EnrolmentCreateInput) {
    // Validate input (catches client-side typos)
    const validated = EnrolmentInputSchema.parse(enrolmentData);
    const {
      age_override_confirmed = false,
      age_override_reason = null,
      ...insertBase
    } = validated;

    return this.withRetry(async () => {
      // Check for duplicate enrolment (same person+class+term)
      if (validated.person_id && validated.offering_id && validated.season_id) {
        const { data: existing, error: checkError } = await TenantDB.selectFor('engagements', tenant)
          .eq('person_id', validated.person_id)
          .eq('offering_id', validated.offering_id)
          .eq('season_id', validated.season_id)
          .in('status', [...NON_TERMINAL_ENGAGEMENT_STATUSES])
          .maybeSingle();

        if (checkError) throw checkError;
        if (existing) throw new Error('Person already enrolled in this class for this term');
      }

      let insertPayload: Record<string, unknown> = { ...insertBase };

      if (validated.person_id && validated.offering_id) {
        const [{ data: person, error: personError }, { data: offering, error: offeringError }] =
          await Promise.all([
            TenantDB.selectFor('people', tenant).eq('id', validated.person_id).maybeSingle(),
            TenantDB.selectFor('offerings', tenant).eq('id', validated.offering_id).maybeSingle(),
          ]);

        if (personError) throw personError;
        if (offeringError) throw offeringError;

        let seasonStartDate: string | null = null;
        if (offering?.season_id) {
          const { data: season, error: seasonError } = await TenantDB.selectFor('seasons', tenant)
            .eq('id', offering.season_id)
            .maybeSingle();
          if (seasonError) throw seasonError;
          seasonStartDate = season?.start_date ?? null;
        }
        const ageEligible =
          offering &&
          person &&
          isAgeEligible(
            {
              min_age: offering.min_age,
              max_age: offering.max_age,
              season_start_date: seasonStartDate,
            },
            {
              date_of_birth: person.date_of_birth,
            },
          );

        if (ageEligible === false) {
          if (!age_override_confirmed) {
            throw new Error('Student is not eligible for this class age range');
          }

          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!user?.id) throw new Error('Only admins can override age requirements');

          const { data: profile, error: profileError } = await TenantDB.selectFor('user_profiles', tenant)
            .select('id, role')
            .eq('id', user.id)
            .maybeSingle();
          if (profileError) throw profileError;

          const roles = Array.isArray(profile?.role) ? profile.role : [];
          if (!roles.includes('tenant_admin')) {
            throw new Error('Only admins can override age requirements');
          }

          insertPayload = {
            ...insertPayload,
            age_override_at: new Date().toISOString(),
            age_override_by: user.id,
            age_override_reason: age_override_reason?.trim() || null,
          };
        }
      }

      const { data, error } = await TenantDB.insert('engagements', tenant, insertPayload)
        .select()
        .single();

      if (error) throw error;

      const result = EngagementSchema.parse(data);
      await this.logAudit(tenant, 'CREATE', 'enrolments', result.id);
      return result;
    }, 'EnrolmentService.create');
  }

  /**
   * Update enrolment (status → active, payment fields, etc.).
   * Do not use for cancellation — use EnrolmentCancellationService.cancelPrePayment.
   */
  static async update(tenant: Tenant, id: string, enrolmentData: Partial<Engagement>) {
    const validated = EnrolmentInputSchema.parse(enrolmentData);

    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('engagements', tenant, id, validated)
        .select()
        .single();

      if (error) throw error;

      const result = EngagementSchema.parse(data);
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
      const { error } = await TenantDB.delete('engagements', tenant, id);
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

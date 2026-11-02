import {
  CancelEnrolmentInputSchema,
  EngagementSchema,
  type Engagement,
  type Tenant,
} from '@shared/schemas';
import { supabase } from '@/lib/supabase';
import type { z } from 'zod';

export class EnrolmentCancellationService {
  static async cancelPrePayment(
    _tenant: Tenant,
    input: z.infer<typeof CancelEnrolmentInputSchema>,
  ): Promise<Engagement> {
    const validated = CancelEnrolmentInputSchema.parse(input);
    const { data, error } = await supabase.rpc('cancel_engagement', {
      p_engagement_id: validated.engagementId,
      p_reason: validated.reason ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return EngagementSchema.parse(data);
  }

  /** An ACTIVE (paid) enrolment: cancels it and stops its monthly plan (no further charges). */
  static async cancelActive(
    _tenant: Tenant,
    input: z.infer<typeof CancelEnrolmentInputSchema>,
  ): Promise<Engagement> {
    const validated = CancelEnrolmentInputSchema.parse(input);
    const { data, error } = await supabase.rpc('cancel_active_engagement', {
      p_engagement_id: validated.engagementId,
      p_reason: validated.reason ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return EngagementSchema.parse(data);
  }
}

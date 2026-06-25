import { supabase } from '@/lib/supabase';
import { EngagementSchema, type Engagement } from '@shared/schemas';

function parseRpcError(error: { message?: string } | null): never {
  const message = error?.message ?? 'Unknown error';
  throw new Error(message);
}

export function mapAgeReviewRpcError(message: string): string {
  if (message.includes('AGE_ELIGIBLE')) return 'pages.enrolment.age_review_error_eligible';
  if (message.includes('INVALID_NOTE')) return 'pages.enrolment.age_review_error_note_too_short';
  if (message.includes('Forbidden') || message.includes('Use admin override')) {
    return 'pages.enrolment.age_review_error_forbidden';
  }
  if (message.includes('Duplicate engagement')) return 'pages.enrolment.already_enrolled_class';
  return 'pages.enrolment.age_review_error_generic';
}

export async function approveAgeReviewEngagement(
  engagementId: string,
  adminReason?: string,
): Promise<Engagement> {
  const { data, error } = await supabase.rpc('approve_age_review_engagement', {
    p_engagement_id: engagementId,
    p_admin_reason: adminReason ?? null,
  });

  if (error) parseRpcError(error);

  return EngagementSchema.parse(data);
}

export async function declineAgeReviewEngagement(
  engagementId: string,
  reason?: string,
): Promise<Engagement> {
  const { data, error } = await supabase.rpc('decline_age_review_engagement', {
    p_engagement_id: engagementId,
    p_reason: reason ?? null,
  });

  if (error) parseRpcError(error);

  return EngagementSchema.parse(data);
}

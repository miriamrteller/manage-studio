import { supabase } from '@/lib/supabase';

export interface AcceptEnrolmentTermsResult {
  alreadyAccepted: boolean;
  acceptedAt: string | null;
  version: string | null;
}

/** Record that the enrolment terms + privacy checkbox was ticked (accept-enrolment-terms). */
export async function acceptEnrolmentTerms(input: {
  engagementId: string;
  enrolmentToken?: string;
}): Promise<AcceptEnrolmentTermsResult> {
  const { data, error } = await supabase.functions.invoke('accept-enrolment-terms', {
    body: {
      engagement_id: input.engagementId,
      ...(input.enrolmentToken ? { enrolment_token: input.enrolmentToken } : {}),
    },
    ...(input.enrolmentToken
      ? { headers: { Authorization: `WaiverToken ${input.enrolmentToken}` } }
      : {}),
  });

  if (error) {
    throw new Error(error.message || 'Could not record the terms acceptance');
  }
  const body = (data ?? {}) as Record<string, unknown>;
  if (typeof body.error === 'string' && body.error) {
    throw new Error(body.error);
  }
  return {
    alreadyAccepted: body.alreadyAccepted === true,
    acceptedAt: typeof body.acceptedAt === 'string' ? body.acceptedAt : null,
    version: typeof body.version === 'string' ? body.version : null,
  };
}

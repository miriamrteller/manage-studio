import { supabase } from '@/lib/supabase';
import type { OfflinePaymentMethod } from './adminEnrolmentService';

export type { OfflinePaymentMethod };

export interface OfflinePaymentRequestResult {
  paymentId: string;
  method: OfflinePaymentMethod;
  amountMinor: number | null;
  currency: string | null;
  offlineInstructions: string | null;
}

/**
 * The parent chose "pay at the studio" on the public checkout of a studio with no online
 * payment provider. Records the choice server-side (request-offline-payment) so the admin
 * sees who still owes what; the enrolment stays pending until the studio records the money.
 */
export async function requestOfflinePayment(input: {
  engagementId: string;
  offeringId: string;
  method: OfflinePaymentMethod;
  enrolmentToken?: string;
}): Promise<OfflinePaymentRequestResult> {
  const { data, error } = await supabase.functions.invoke('request-offline-payment', {
    body: {
      engagement_id: input.engagementId,
      offering_id: input.offeringId,
      method: input.method,
      ...(input.enrolmentToken ? { enrolment_token: input.enrolmentToken } : {}),
    },
    ...(input.enrolmentToken
      ? { headers: { Authorization: `WaiverToken ${input.enrolmentToken}` } }
      : {}),
  });

  if (error) {
    throw new Error(error.message || 'Could not record the payment request');
  }
  const body = (data ?? {}) as Record<string, unknown>;
  if (typeof body.error === 'string' && body.error) {
    throw new Error(body.error);
  }

  return {
    paymentId: typeof body.paymentId === 'string' ? body.paymentId : '',
    method: input.method,
    amountMinor: typeof body.amountMinor === 'number' ? body.amountMinor : null,
    currency: typeof body.currency === 'string' ? body.currency : null,
    offlineInstructions:
      typeof body.offlineInstructions === 'string' ? body.offlineInstructions : null,
  };
}

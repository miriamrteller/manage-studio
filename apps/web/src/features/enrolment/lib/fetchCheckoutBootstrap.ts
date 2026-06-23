import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import type {
  PrepareEnrolmentCheckoutBody,
  PrepareEnrolmentCheckoutResponse,
} from './checkoutBootstrapTypes';

const checkoutBootstrapInflight = new Map<string, Promise<PrepareEnrolmentCheckoutResponse>>();

function buildInflightKey(body: PrepareEnrolmentCheckoutBody, token?: string): string {
  return JSON.stringify({ ...body, token: token ?? null });
}

export async function fetchCheckoutBootstrap(
  body: PrepareEnrolmentCheckoutBody,
  options?: { enrolmentToken?: string; setupFailedMessage?: string },
): Promise<PrepareEnrolmentCheckoutResponse> {
  const token =
    options?.enrolmentToken ??
    (body.mode === 'existing_engagement' ? body.enrolment_token : undefined);
  const cacheKey = buildInflightKey(body, token);
  const inflight = checkoutBootstrapInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke('prepare-enrolment-checkout', {
      body,
      ...(token ? { headers: { Authorization: `WaiverToken ${token}` } } : {}),
    });

    const parsed = await parseFunctionInvokeBody(data, error);
    if (error || parsed?.error) {
      throw new Error(
        error?.message ??
          (typeof parsed?.error === 'string' ? parsed.error : null) ??
          options?.setupFailedMessage ??
          'Checkout setup failed',
      );
    }

    return parsed as unknown as PrepareEnrolmentCheckoutResponse;
  })();

  checkoutBootstrapInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    checkoutBootstrapInflight.delete(cacheKey);
  }
}

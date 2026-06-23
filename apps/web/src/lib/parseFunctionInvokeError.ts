/** Parsed JSON body from a Supabase Edge Function invoke (success or non-2xx). */
export interface FunctionInvokeBody {
  code?: string;
  error?: string;
  message?: string;
  confirmed?: boolean;
  [key: string]: unknown;
}

/**
 * Edge Functions that return 4xx populate `error` on the client with a generic
 * "non-2xx" message. The real payload is on error.context (Response) or sometimes `data`.
 */
export async function parseFunctionInvokeBody(
  data: unknown,
  error: unknown,
): Promise<FunctionInvokeBody | null> {
  if (data && typeof data === 'object') {
    return data as FunctionInvokeBody;
  }

  if (!error || typeof error !== 'object') {
    return null;
  }

  try {
    const response = (error as { context?: Response }).context;
    if (response) {
      return (await response.json()) as FunctionInvokeBody;
    }
  } catch {
    // fall through
  }

  return null;
}

export function functionInvokeErrorMessage(
  error: unknown,
  body: FunctionInvokeBody | null,
  fallback: string,
): string {
  if (body?.code === 'MOCK_PAYMENT_DECLINED') {
    return fallback;
  }
  if (typeof body?.error === 'string' && body.error) {
    return body.error;
  }
  if (typeof body?.message === 'string' && body.message) {
    return body.message;
  }
  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return error.message;
  }
  return fallback;
}

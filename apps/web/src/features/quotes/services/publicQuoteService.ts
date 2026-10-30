import { supabase } from '@/lib/supabase';
import { publicAcceptSchema, type PublicAcceptInput, type QuoteStatus } from '../lib/quoteSchemas';

/** What a client sees on /quote/:token (get_public_quote — no internals). */
export interface PublicQuoteLine {
  id: string;
  description: string;
  qty: number;
  unit_price_minor: number;
  line_total_minor: number;
  is_optional: boolean;
  is_selected: boolean;
}

export interface PublicQuote {
  status: QuoteStatus;
  title: string | null;
  currency: string;
  shoot_date: string | null;
  valid_until: string | null;
  notes: string | null;
  deposit_percent: number;
  total_minor: number;
  deposit_minor: number;
  balance_minor: number;
  accepted_at: string | null;
  client_name: string | null;
  lines: PublicQuoteLine[];
}

export interface AcceptQuoteResponse {
  ok: boolean;
  code?: string;
  already_accepted?: boolean;
  contract_to_follow?: boolean;
}

export async function fetchPublicQuote(token: string, tenantId: string): Promise<PublicQuote | null> {
  const { data, error } = await supabase.rpc('get_public_quote', { p_token: token, p_tenant_id: tenantId });
  if (error) throw new Error(error.message);
  return (data ?? null) as PublicQuote | null;
}

export async function acceptPublicQuote(input: PublicAcceptInput): Promise<AcceptQuoteResponse> {
  const body = publicAcceptSchema.parse(input);
  const { data, error } = await supabase.functions.invoke('accept-quote', { body });
  // 409 carries a business code (expired, not_open…) in the body.
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        return (await context.json()) as AcceptQuoteResponse;
      } catch {
        // fall through to the generic error
      }
    }
    throw new Error(error.message);
  }
  return data as AcceptQuoteResponse;
}

export async function declinePublicQuote(token: string, tenantId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('decline_public_quote', {
    p_token: token, p_tenant_id: tenantId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

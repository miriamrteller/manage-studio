import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import type { AcceptedQuoteSnapshot } from '@/features/jobs/lib/bookingProgress';
import type { AutomaticEmailKey, QuoteDraft, QuoteStatus } from '../lib/quoteSchemas';

/**
 * Admin quotes. Reads and writes go through SECURITY DEFINER RPCs
 * (save_quote is atomic: quote + line replace), RLS limits them to tenant admins.
 */
export interface QuoteLine {
  id: string;
  offering_id: string | null;
  description: string;
  qty: number;
  unit_price_minor: number;
  line_total_minor: number;
  is_optional: boolean;
  is_selected: boolean;
  sort_order: number;
}

export interface QuoteSummary {
  id: string;
  status: QuoteStatus;
  title: string | null;
  lead_id: string | null;
  engagement_id: string | null;
  total_minor: number;
  currency: string;
  shoot_date: string | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  client_name: string | null;
}

export interface QuoteDetail extends QuoteSummary {
  public_token: string;
  notes: string | null;
  deposit_percent: number;
  balance_max_installments: number;
  send_contract_on_accept: boolean;
  deposit_minor: number;
  balance_minor: number;
  client_email: string | null;
  client_phone: string | null;
  lines: QuoteLine[];
}

export interface QuotePackage {
  id: string;
  name: string;
  price_minor: number;
}

export type QuoteSendVia = 'email' | 'whatsapp' | 'link';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class QuoteService extends BaseService {
  static async list(): Promise<QuoteSummary[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('list_admin_quotes');
      fail(error);
      return (data ?? []) as QuoteSummary[];
    }, 'QuoteService.list');
  }

  static async get(id: string): Promise<QuoteDetail | null> {
    return this.withRetry(async () => {
      const { data, error } = await supabase.rpc('get_admin_quote', { p_quote_id: id });
      fail(error);
      return (data ?? null) as QuoteDetail | null;
    }, 'QuoteService.get');
  }

  static async save(draft: QuoteDraft): Promise<string> {
    const { lines, ...quote } = draft;
    const { data, error } = await supabase.rpc('save_quote', { p_quote: quote, p_lines: lines });
    fail(error);
    return data as string;
  }

  /** The shoot's accepted quote (admin RLS), for the booking progress strip. */
  static async acceptedForEngagement(engagementId: string): Promise<AcceptedQuoteSnapshot | null> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('accepted_at, accepted_result')
        .eq('engagement_id', engagementId)
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      fail(error);
      return (data ?? null) as AcceptedQuoteSnapshot | null;
    }, 'QuoteService.acceptedForEngagement');
  }

  static async markSent(id: string, via: QuoteSendVia): Promise<void> {
    const { error } = await supabase.rpc('mark_quote_sent', { p_quote_id: id, p_via: via });
    fail(error);
  }

  static async packages(tenantId: string): Promise<QuotePackage[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, name, price_minor')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('name');
      fail(error);
      return (data ?? []) as QuotePackage[];
    }, 'QuoteService.packages');
  }

  /** Missing rows mean ON (is_automatic_email_enabled in SQL). */
  static async automaticEmails(tenantId: string): Promise<Record<AutomaticEmailKey, boolean>> {
    const { data, error } = await supabase
      .from('tenant_automatic_emails')
      .select('email_key, enabled')
      .eq('tenant_id', tenantId);
    fail(error);
    const settings: Record<AutomaticEmailKey, boolean> = {
      quote_sent: true, booking_confirmed: true, shoot_reminder: true, shoot_thank_you: true, gallery_ready: true,
    };
    for (const row of (data ?? []) as { email_key: AutomaticEmailKey; enabled: boolean }[]) {
      settings[row.email_key] = row.enabled;
    }
    return settings;
  }

  static async setAutomaticEmail(tenantId: string, key: AutomaticEmailKey, enabled: boolean): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('tenant_automatic_emails').upsert({
      tenant_id: tenantId, email_key: key, enabled,
      updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString(),
    });
    fail(error);
  }
}

import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/** Why a shoot was not sent (send-shoot-gallery), or that it was. */
export type SendGalleryOutcome =
  | 'sent'
  | 'failed'
  | 'already_sent'
  | 'not_found'
  | 'cancelled'
  | 'no_email'
  | 'not_checked'
  | 'no_gallery';

export interface SendGalleryResult {
  sent: number;
  skipped: number;
  failed: number;
  results: Array<{ engagementId: string; outcome: SendGalleryOutcome }>;
}

/** At most this many shoots per press (the Edge Function's limit). */
export const SEND_GALLERY_MAX = 100;

/**
 * "Send gallery" (owner, 18 Nov 2026): emails each client their gallery and photo shop
 * link now, opens the gallery on their page and moves the shoot to Delivered.
 */
export const ShootGalleryService = {
  /**
   * More than SEND_GALLERY_MAX shoots go in several calls, one after another.
   * resend: false skips clients who already got the gallery email ("already_sent").
   * message: the studio's own words for the email's main paragraph (plain text; the
   * links stay outside it). Left out when not given, so the standard text goes.
   */
  async send(
    engagementIds: string[],
    { resend = false, message }: { resend?: boolean; message?: string } = {},
  ): Promise<SendGalleryResult> {
    const total: SendGalleryResult = { sent: 0, skipped: 0, failed: 0, results: [] };
    for (let i = 0; i < engagementIds.length; i += SEND_GALLERY_MAX) {
      const chunk = engagementIds.slice(i, i + SEND_GALLERY_MAX);
      const { data, error } = await supabase.functions.invoke('send-shoot-gallery', {
        body: message ? { engagementIds: chunk, resend, message } : { engagementIds: chunk, resend },
      });
      const parsed = await parseFunctionInvokeBody(data, error);
      if (error || !parsed || !Array.isArray(parsed.results)) throw new Error('send_gallery_failed');
      total.sent += Number(parsed.sent) || 0;
      total.skipped += Number(parsed.skipped) || 0;
      total.failed += Number(parsed.failed) || 0;
      total.results.push(...(parsed.results as SendGalleryResult['results']));
    }
    return total;
  },

  /** When each shoot's gallery email last went (the delivery log; studio admins may read it). */
  async lastSent(engagementIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (engagementIds.length === 0) return map;
    const { data, error } = await supabase
      .from('automatic_email_log')
      .select('engagement_id, updated_at')
      .eq('email_key', 'gallery_ready')
      .eq('status', 'sent')
      .in('engagement_id', engagementIds);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ engagement_id: string | null; updated_at: string }>) {
      if (row.engagement_id) map.set(row.engagement_id, row.updated_at);
    }
    return map;
  },
};

import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/** Why a shoot was not sent (send-shoot-gallery), or that it was. */
export type SendGalleryOutcome =
  | 'sent'
  | 'failed'
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
  /** More than SEND_GALLERY_MAX shoots go in several calls, one after another. */
  async send(engagementIds: string[]): Promise<SendGalleryResult> {
    const total: SendGalleryResult = { sent: 0, skipped: 0, failed: 0, results: [] };
    for (let i = 0; i < engagementIds.length; i += SEND_GALLERY_MAX) {
      const chunk = engagementIds.slice(i, i + SEND_GALLERY_MAX);
      const { data, error } = await supabase.functions.invoke('send-shoot-gallery', { body: { engagementIds: chunk } });
      const parsed = await parseFunctionInvokeBody(data, error);
      if (error || !parsed || !Array.isArray(parsed.results)) throw new Error('send_gallery_failed');
      total.sent += Number(parsed.sent) || 0;
      total.skipped += Number(parsed.skipped) || 0;
      total.failed += Number(parsed.failed) || 0;
      total.results.push(...(parsed.results as SendGalleryResult['results']));
    }
    return total;
  },
};

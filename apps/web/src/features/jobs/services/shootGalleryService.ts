import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { makePreview } from '../lib/photoPreview';

/** The studio's own words and photo for the gallery email (Send gallery, owner 22 Nov 2026). */
export interface GalleryEmailExtras {
  message?: string;
  /** Public address of an uploadGalleryEmailPhoto upload. */
  photoUrl?: string;
  photoAlt?: string;
  /** The name under "Sincerely," (the server keeps it for next time). */
  signature?: string;
}

/** Same folder as GALLERY_PHOTO_FOLDER in supabase/functions/_shared/photo-shop/send-gallery.ts. */
const GALLERY_PHOTO_FOLDER = 'gallery-email';
const TENANT_ASSETS_BUCKET = 'tenant-assets';
/** Longest edge of the email photo: sharp on phones, light to download. */
export const GALLERY_PHOTO_MAX_EDGE = 1200;

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
   * links stay outside it). photoUrl/photoAlt: one photo under it, the same for every
   * client. Each is left out when not given, so the standard email goes.
   */
  async send(
    engagementIds: string[],
    { resend = false, message, photoUrl, photoAlt, signature }: { resend?: boolean } & GalleryEmailExtras = {},
  ): Promise<SendGalleryResult> {
    const extras = {
      ...(message ? { message } : {}),
      ...(signature?.trim() ? { signature: signature.trim() } : {}),
      ...(photoUrl ? { photoUrl, ...(photoAlt?.trim() ? { photoAlt: photoAlt.trim() } : {}) } : {}),
    };
    const total: SendGalleryResult = { sent: 0, skipped: 0, failed: 0, results: [] };
    for (let i = 0; i < engagementIds.length; i += SEND_GALLERY_MAX) {
      const chunk = engagementIds.slice(i, i + SEND_GALLERY_MAX);
      const { data, error } = await supabase.functions.invoke('send-shoot-gallery', {
        body: { engagementIds: chunk, resend, ...extras },
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

  /**
   * The photo for the gallery email: made into a JPEG in her browser (at most
   * GALLERY_PHOTO_MAX_EDGE, no watermark) and stored once in the studio's public
   * assets, so every client's email shows the same hosted image.
   */
  async uploadEmailPhoto(tenantId: string, file: File): Promise<string> {
    const jpeg = await makePreview(file, null, GALLERY_PHOTO_MAX_EDGE);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const path = `${tenantId}/${GALLERY_PHOTO_FOLDER}/${name}`;
    const { error } = await supabase.storage
      .from(TENANT_ASSETS_BUCKET)
      .upload(path, jpeg, { upsert: false, contentType: 'image/jpeg', cacheControl: String(60 * 60 * 24 * 365) });
    if (error) throw new Error(error.message);
    return supabase.storage.from(TENANT_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  /**
   * The name the gallery email is signed with: the one the studio saved, else the
   * signed-in admin's own name. Null: the caller falls back to the studio name.
   */
  async signatureDefault(tenantId: string): Promise<string | null> {
    const { data: saved } = await supabase
      .from('tenant_photo_shop_settings')
      .select('email_signature')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const savedName = (saved as { email_signature?: string | null } | null)?.email_signature?.trim();
    if (savedName) return savedName;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return null;
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('people:person_id(name)')
      .eq('id', auth.user.id)
      .maybeSingle();
    const people = (profile as { people?: { name?: string | null } | Array<{ name?: string | null }> | null } | null)?.people;
    const name = (Array.isArray(people) ? people[0]?.name : people?.name)?.trim();
    return name || null;
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

import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/** "Send shop link": a link that signs the shoot's client straight in for 3 days. */
export interface PhotoShopLink {
  url: string;
  email: string;
  expiresAt: string;
}

export class PhotoShopLinkError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PhotoShopLinkError';
  }
}

async function call(body: Record<string, string>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('photo-shop-link', { body });
  const parsed = await parseFunctionInvokeBody(data, error);
  if (error || !parsed || parsed.ok !== true) {
    throw new PhotoShopLinkError(typeof parsed?.code === 'string' ? parsed.code : 'failed');
  }
  return parsed;
}

export const PhotoShopLinkService = {
  /** Studio admin: make a new 3-day link for this shoot's client. */
  async create(engagementId: string): Promise<PhotoShopLink> {
    const body = await call({ action: 'create', engagementId });
    if (typeof body.url !== 'string' || typeof body.email !== 'string' || typeof body.expiresAt !== 'string') {
      throw new PhotoShopLinkError('failed');
    }
    return { url: body.url, email: body.email, expiresAt: body.expiresAt };
  },

  /** Studio admin: make the link and have OpalSwift email it to the client (one button). */
  async email(engagementId: string): Promise<PhotoShopLink & { emailed: boolean }> {
    const body = await call({ action: 'email', engagementId });
    if (typeof body.url !== 'string' || typeof body.email !== 'string' || typeof body.expiresAt !== 'string') {
      throw new PhotoShopLinkError('failed');
    }
    return { url: body.url, email: body.email, expiresAt: body.expiresAt, emailed: body.emailed === true };
  },

  /**
   * The /shop/:token page: swap the link for the client's session and sign in.
   * Returns the shoot the link is for, so the page can open that shoot's gallery.
   */
  async open(token: string): Promise<{ engagementId: string | null }> {
    const body = await call({ action: 'open', token });
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
      throw new PhotoShopLinkError('sign_in');
    }
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    if (error) throw new PhotoShopLinkError('sign_in');
    return { engagementId: typeof body.engagementId === 'string' ? body.engagementId : null };
  },
};

/** Same as CLIENT_PORTAL_PATH (BackToPortalButton.tsx). */
const CLIENT_PORTAL = '/dashboard/portal';

/**
 * Where the link lands: that shoot's photo shop on its own page (/photos/:id). Without a
 * shoot, the photo shop tab of the client's page.
 */
export function shopGalleryPath(engagementId: string | null): string {
  if (engagementId) return `/photos/${encodeURIComponent(engagementId)}`;
  return `${CLIENT_PORTAL}?tab=shop`;
}

/** The message the studio sends with the link (email body / WhatsApp text). */
export function shopLinkMessage(text: string, url: string): string {
  return `${text}\n${url}`;
}

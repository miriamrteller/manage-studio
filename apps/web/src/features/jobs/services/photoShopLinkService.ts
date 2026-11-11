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

  /** The /shop/:token page: swap the link for the client's session and sign in. */
  async open(token: string): Promise<void> {
    const body = await call({ action: 'open', token });
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
      throw new PhotoShopLinkError('sign_in');
    }
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    if (error) throw new PhotoShopLinkError('sign_in');
  },
};

/** The message the studio sends with the link (email body / WhatsApp text). */
export function shopLinkMessage(text: string, url: string): string {
  return `${text}\n${url}`;
}

import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * Photo shop: the studio's own SmugMug connection (beta, flag billing:photo_shop).
 * Keys are saved encrypted by save_tenant_smugmug_credentials and never read back;
 * the smugmug-connection Edge Function tests, connects and finishes the sign-in.
 */

/** The fixed SmugMug callback, the same for every studio (photographers type it into SmugMug). */
export const SMUGMUG_APP_URL = 'https://app.opalswift.com';
export const SMUGMUG_CALLBACK_URL = 'https://app.opalswift.com/admin/setup/integrations/smugmug/callback';
export const SMUGMUG_APPLY_URL = 'https://api.smugmug.com/api/developer/apply';
export const SMUGMUG_API_DOC_URL = 'https://api.smugmug.com/api/v2/doc';
/** Where the callback page sends the photographer back to. */
export const SMUGMUG_SETTINGS_PATH = '/admin/photo-shop?tab=smugmug';

export interface SmugMugStatus {
  hasKeys: boolean;
  connected: boolean;
  keysUpdatedAt: string | null;
  connectedAt: string | null;
}

/** Outcome codes the page turns into plain sentences (settings.smugmug.result.*). */
export type SmugMugResultCode =
  | 'keys'
  | 'account'
  | 'keys_rejected'
  | 'token_rejected'
  | 'unreachable'
  | 'no_keys'
  | 'failed';

/** Callback outcome codes (settings.smugmug.callback.*). */
export type SmugMugCallbackCode = 'expired' | 'refused' | 'missing';

export class SmugMugActionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'SmugMugActionError';
  }
}

async function call(body: Record<string, string>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('smugmug-connection', { body });
  const parsed = await parseFunctionInvokeBody(data, error);
  if (error || !parsed || parsed.ok === false) {
    throw new SmugMugActionError(typeof parsed?.code === 'string' ? parsed.code : 'failed');
  }
  return parsed;
}

export const SmugMugService = {
  async getStatus(): Promise<SmugMugStatus> {
    const { data, error } = await supabase.rpc('tenant_smugmug_status');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      hasKeys: Boolean(row?.has_keys),
      connected: Boolean(row?.connected),
      keysUpdatedAt: row?.keys_updated_at ?? null,
      connectedAt: row?.connected_at ?? null,
    };
  },

  async saveKeys(apiKey: string, apiSecret: string): Promise<void> {
    const { error } = await supabase.rpc('save_tenant_smugmug_credentials', {
      p_api_key: apiKey.trim(),
      p_api_secret: apiSecret.trim(),
    });
    if (error) throw error;
  },

  /** "Test connection": resolves with a result code, never throws for a refused key. */
  async test(): Promise<SmugMugResultCode> {
    try {
      const body = await call({ action: 'test' });
      return body.stage === 'account' ? 'account' : 'keys';
    } catch (e) {
      const code = e instanceof SmugMugActionError ? e.code : 'failed';
      const known: SmugMugResultCode[] = ['keys_rejected', 'token_rejected', 'unreachable', 'no_keys'];
      return (known as string[]).includes(code) ? (code as SmugMugResultCode) : 'failed';
    }
  },

  /** "Connect SmugMug": sends the browser to SmugMug's sign-in page. */
  async start(): Promise<void> {
    const body = await call({ action: 'start' });
    if (typeof body.url !== 'string' || !body.url.startsWith('https://api.smugmug.com/')) {
      throw new SmugMugActionError('failed');
    }
    window.location.assign(body.url);
  },

  /** The callback page: swap SmugMug's token + verifier for the access token. */
  async complete(oauthToken: string, oauthVerifier: string): Promise<void> {
    await call({ action: 'complete', oauth_token: oauthToken, oauth_verifier: oauthVerifier });
  },

  async disconnect(): Promise<void> {
    const { error } = await supabase.rpc('disconnect_tenant_smugmug');
    if (error) throw error;
  },
};

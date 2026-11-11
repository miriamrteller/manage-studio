import { supabase } from '@/lib/supabase';
import {
  functionInvokeErrorMessage,
  parseFunctionInvokeBody,
} from '@/lib/parseFunctionInvokeError';

export interface GoogleCalendarConnection {
  connected: boolean;
  email: string | null;
}

/** Server set-up problems the admin cannot fix: shown as one plain sentence, not the technical text. */
const SERVER_NOT_SET_UP = new Set(['OAuth is not configured', 'APP_URL is not configured on the server']);
const CONNECT_FAILED = 'Google Calendar could not be connected right now. Please try again later.';
const DISCONNECT_FAILED = 'Google Calendar could not be disconnected. Please try again.';

/** The readable reason behind a refused call (the client's own message is just "non-2xx"). */
async function refusalMessage(data: unknown, error: unknown, fallback: string): Promise<Error> {
  const body = await parseFunctionInvokeBody(data, error);
  if (body?.error && SERVER_NOT_SET_UP.has(body.error)) return new Error(fallback);
  return new Error(functionInvokeErrorMessage(error, body, fallback));
}

export const GoogleCalendarService = {
  async getConnection(): Promise<GoogleCalendarConnection> {
    const { data, error } = await supabase.rpc('get_google_calendar_connection');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { connected: Boolean(row?.connected), email: row?.email ?? null };
  },

  /** Kicks off OAuth: fetches the consent URL then redirects the browser to Google. */
  async start(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('google-calendar-oauth-start', {
      body: {},
    });
    if (error) throw await refusalMessage(data, error, CONNECT_FAILED);
    const url = (data as { url?: string })?.url;
    if (!url) throw new Error('No OAuth URL returned');
    window.location.href = url;
  },

  /**
   * The studio address a signed state belongs to (no sign-in needed). Google returns to
   * the one registered address on app.<root>; the page carries on at this address.
   */
  async studioUrl(state: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('google-calendar-oauth-callback', {
      body: { action: 'studio_url', state },
    });
    const url = (data as { studio_url?: string } | null)?.studio_url;
    if (error || !url) throw new Error('studio_url');
    return url;
  },

  async complete(code: string, state: string): Promise<{ email: string | null }> {
    const { data, error } = await supabase.functions.invoke('google-calendar-oauth-callback', {
      body: { code, state },
    });
    const body = await parseFunctionInvokeBody(data, error);
    if (error) {
      throw new Error(
        functionInvokeErrorMessage(error, body, 'Google Calendar connection failed'),
      );
    }
    return { email: (data as { email?: string | null })?.email ?? null };
  },

  async disconnect(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('google-calendar-disconnect', { body: {} });
    if (error) throw await refusalMessage(data, error, DISCONNECT_FAILED);
  },

  async syncAppointment(engagementId: string, action: 'insert' | 'delete'): Promise<void> {
    const { error } = await supabase.functions.invoke('google-calendar-sync-event', {
      body: { engagement_id: engagementId, action },
    });
    if (error) throw error;
  },
};

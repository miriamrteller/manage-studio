import { supabase } from '@/lib/supabase';

export interface GoogleCalendarConnection {
  connected: boolean;
  email: string | null;
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
    if (error) throw error;
    const url = (data as { url?: string })?.url;
    if (!url) throw new Error('No OAuth URL returned');
    window.location.href = url;
  },

  async complete(code: string, state: string): Promise<{ email: string | null }> {
    const { data, error } = await supabase.functions.invoke('google-calendar-oauth-callback', {
      body: { code, state },
    });
    if (error) throw error;
    return { email: (data as { email?: string | null })?.email ?? null };
  },

  async disconnect(): Promise<void> {
    const { error } = await supabase.functions.invoke('google-calendar-disconnect', { body: {} });
    if (error) throw error;
  },

  async syncAppointment(engagementId: string, action: 'insert' | 'delete'): Promise<void> {
    const { error } = await supabase.functions.invoke('google-calendar-sync-event', {
      body: { engagement_id: engagementId, action },
    });
    if (error) throw error;
  },
};

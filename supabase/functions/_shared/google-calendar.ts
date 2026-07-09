/**
 * Google Calendar helpers for Edge Functions.
 *
 * Token storage/refresh goes through SECURITY DEFINER RPCs (003600). Set
 * GOOGLE_CALENDAR_MOCK=true in dev to short-circuit all network calls (mirrors GROW_MOCK).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
const MOCK = (Deno.env.get("GOOGLE_CALENDAR_MOCK") ?? "").toLowerCase() === "true";
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isGoogleMock(): boolean {
  return MOCK;
}

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string }> {
  if (MOCK) {
    return {
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Google token exchange failed");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  if (MOCK) return "mock@example.com";
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Google token refresh failed");
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export interface GoogleConnection {
  accessToken: string;
  calendarId: string;
}

/**
 * Returns a valid access token for the tenant, refreshing proactively.
 * Returns null when the tenant has not connected Google Calendar.
 */
export async function getValidAccessToken(
  service: SupabaseClient,
  tenantId: string,
): Promise<GoogleConnection | null> {
  if (MOCK) return { accessToken: "mock-access-token", calendarId: "primary" };

  const { data, error } = await service.rpc("get_tenant_google_credentials", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.refresh_token) return null;

  const calendarId = (row.calendar_id as string) ?? "primary";
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;

  if (row.access_token && expiresAt > Date.now() + REFRESH_SKEW_MS) {
    return { accessToken: row.access_token as string, calendarId };
  }

  const refreshed = await refreshAccessToken(row.refresh_token as string);
  await service.rpc("update_tenant_google_access_token", {
    p_tenant_id: tenantId,
    p_access_token: refreshed.accessToken,
    p_expires_at: refreshed.expiresAt,
  });
  return { accessToken: refreshed.accessToken, calendarId };
}

export interface BusyInterval {
  start: string;
  end: string;
}

/**
 * Free/busy for [timeMin, timeMax]. Throws on API error so callers can fail closed.
 */
export async function freeBusy(
  conn: GoogleConnection,
  timeMin: string,
  timeMax: string,
): Promise<BusyInterval[]> {
  if (MOCK) return [];
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: conn.calendarId }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Google freeBusy failed");
  const busy = data?.calendars?.[conn.calendarId]?.busy ?? [];
  return busy as BusyInterval[];
}

export async function insertEvent(
  conn: GoogleConnection,
  event: { summary: string; description?: string; start: string; end: string; attendeeEmail?: string | null },
): Promise<string | null> {
  if (MOCK) return `mock-event-${crypto.randomUUID()}`;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description ?? "",
        start: { dateTime: event.start, timeZone: "Asia/Jerusalem" },
        end: { dateTime: event.end, timeZone: "Asia/Jerusalem" },
        ...(event.attendeeEmail ? { attendees: [{ email: event.attendeeEmail }] } : {}),
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Google event insert failed");
  return (data.id as string) ?? null;
}

export async function deleteEvent(conn: GoogleConnection, eventId: string): Promise<void> {
  if (MOCK) return;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${conn.accessToken}` } },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Google event delete failed");
  }
}

export async function revokeToken(token: string): Promise<void> {
  if (MOCK) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => {});
}

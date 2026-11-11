import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * Booked clients sign in without a password (client-sign-in Edge Function).
 * - openSignInLink: the "Go to my page" button in a booking email (valid 3 days).
 * - prepareClientLogin: before the login page sends the sign-in email, makes the login
 *   of a booked client who has none yet. Never fails the sign-in: errors are ignored.
 */

/** The token from the link's fragment (#t=…), or null. */
export function signInTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const t = params.get('t')?.trim() ?? '';
  return /^[A-Za-z0-9_-]{32,128}$/.test(t) ? t : null;
}

export async function openSignInLink(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('client-sign-in', {
    body: { action: 'open', token },
  });
  const body = await parseFunctionInvokeBody(data, error);
  if (error || body?.ok !== true || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
    throw new Error('sign_in_link_failed');
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (sessionError) throw new Error('sign_in_link_failed');
}

/** Waits at most `timeoutMs`, so a slow answer never holds up the sign-in email. */
export async function prepareClientLogin(subdomain: string, email: string, timeoutMs = 4000): Promise<void> {
  try {
    await Promise.race([
      supabase.functions.invoke('client-sign-in', { body: { action: 'prepare', subdomain, email } }),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignored: the sign-in email is sent either way.
  }
}

import { supabase } from '@/lib/supabase';

/** Where a password-reset email returns: the usual sign-in callback, then the new-password screen. */
export function passwordResetRedirect(origin: string = window.location.origin): string {
  const url = new URL(`${origin}/auth/callback`);
  url.searchParams.set('next', 'new-password');
  return url.toString();
}

/**
 * Emails a link to set a new password. The link returns to this site (studio subdomain or
 * custom domain), which must be on the Supabase redirect allow-list, like sign-in links.
 * Whether the account exists is never revealed: the caller shows the same message either way.
 */
export async function sendPasswordReset(email: string, captchaToken?: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: passwordResetRedirect(),
    ...(captchaToken ? { captchaToken } : {}),
  });
  if (error) throw error;
}

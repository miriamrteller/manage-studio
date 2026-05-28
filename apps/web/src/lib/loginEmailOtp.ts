import { supabase } from '@/lib/supabase';

/** Send a login email OTP (6-digit code). Includes emailRedirectTo so any link in the email lands on /auth/callback. */
export async function sendLoginEmailOtp(
  email: string,
  subdomain: string,
  emailRedirectTo: string,
) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
      data: { subdomain },
    },
  });
}

/** Verify a login email OTP and establish a session. */
export async function verifyLoginEmailOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
}

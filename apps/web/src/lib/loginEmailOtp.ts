import { supabase } from '@/lib/supabase';
import type { LoginOtpOptions } from '@/lib/loginOtpOptions';

/** Send a login email OTP (6-digit code). Includes emailRedirectTo so any link in the email lands on /auth/callback. */
export async function sendLoginEmailOtp(
  email: string,
  options: LoginOtpOptions,
  emailRedirectTo: string,
  /** Turnstile token, required once Supabase CAPTCHA is on. */
  captchaToken?: string,
) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: options.shouldCreateUser,
      emailRedirectTo,
      data: options.data,
      ...(captchaToken ? { captchaToken } : {}),
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

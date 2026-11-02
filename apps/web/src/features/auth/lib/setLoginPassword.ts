import { supabase } from '@/lib/supabase';

export interface SetLoginPasswordInput {
  email: string;
  password: string;
  currentPassword?: string;
  /** Turnstile token for the current-password check (Supabase CAPTCHA). */
  captchaToken?: string;
}

export async function setLoginPassword({
  email,
  password,
  currentPassword,
  captchaToken,
}: SetLoginPasswordInput): Promise<void> {
  if (currentPassword) {
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (verifyError) throw verifyError;
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

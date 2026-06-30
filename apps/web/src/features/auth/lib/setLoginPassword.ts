import { supabase } from '@/lib/supabase';

export interface SetLoginPasswordInput {
  email: string;
  password: string;
  currentPassword?: string;
}

export async function setLoginPassword({
  email,
  password,
  currentPassword,
}: SetLoginPasswordInput): Promise<void> {
  if (currentPassword) {
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) throw verifyError;
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

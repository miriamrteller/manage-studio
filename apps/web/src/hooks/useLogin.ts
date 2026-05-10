import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { LoginFormSchema, type LoginForm } from '../schemas';

/**
 * useLogin: Handles magic link authentication logic
 * - Manages form submission state (loading, messages)
 * - Calls Supabase OTP signin
 * - Returns form state and submission handler
 * 
 * Separation of concerns:
 * - This hook handles all logic: API calls, state, error handling
 * - LoginForm component handles UI rendering only
 * - Pages compose these together
 */

export interface LoginState {
  isLoading: boolean;
  message: {
    type: 'success' | 'error';
    text: string;
  } | null;
}

export interface LoginActions {
  onSubmit: (_formData: LoginForm) => Promise<void>;
  resetMessage: () => void;
}

export function useLogin(onSuccess?: () => void): LoginState & LoginActions {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<LoginState['message']>(null);

  const onSubmit = async (formData: LoginForm) => {
    setIsLoading(true);
    setMessage(null);

    try {
      // Validate input with Zod schema
      const validatedData = LoginFormSchema.parse(formData);

      // Send magic link
      const { error } = await supabase.auth.signInWithOtp({
        email: validatedData.email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setMessage({
          type: 'error',
          text: error.message || t('error.login_failed'),
        });
      } else {
        setMessage({
          type: 'success',
          text: t('pages.login.check_email'),
        });
        // Call optional success callback
        onSuccess?.();
      }
    } catch (err) {
      // Zod validation or unexpected error
      const errorMessage = err instanceof Error ? err.message : t('error.unexpected');
      setMessage({
        type: 'error',
        text: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetMessage = () => {
    setMessage(null);
  };

  return {
    isLoading,
    message,
    onSubmit,
    resetMessage,
  };
}

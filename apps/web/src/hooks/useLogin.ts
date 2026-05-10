import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { LoginFormSchema, PasswordLoginSchema, type LoginForm, type PasswordLogin } from '../schemas';

/**
 * useLogin: Handles authentication logic (password and magic link)
 * - Manages form submission state (loading, messages)
 * - Calls Supabase password signin or OTP signin
 * - Returns form state and submission handler
 * 
 * Separation of concerns:
 * - This hook handles all logic: API calls, state, error handling
 * - LoginForm component handles UI rendering only
 * - Pages compose these together
 */

type AuthMode = 'password' | 'magic_link';
type FormData = LoginForm | PasswordLogin;

export interface LoginState {
  isLoading: boolean;
  message: {
    type: 'success' | 'error';
    text: string;
  } | null;
}

export interface LoginActions {
  onSubmit: (_formData: FormData, _authMode: AuthMode) => Promise<void>;
  resetMessage: () => void;
}

export function useLogin(): LoginState & LoginActions {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<LoginState['message']>(null);

  const onSubmit = async (formData: FormData, authMode: AuthMode) => {
    setIsLoading(true);
    setMessage(null);

    try {
      if (authMode === 'password') {
        // Password authentication
        const passwordData = PasswordLoginSchema.parse(formData);
        
        const { error } = await supabase.auth.signInWithPassword({
          email: passwordData.email,
          password: passwordData.password,
        });

        if (error) {
          // Handle specific error cases
          if (error.message.includes('Invalid login credentials')) {
            setMessage({
              type: 'error',
              text: t('pages.login.invalid_credentials'),
            });
          } else {
            setMessage({
              type: 'error',
              text: error.message || t('error.login_failed'),
            });
          }
        } else {
          setMessage({
            type: 'success',
            text: t('pages.login.check_email'),
          });
          // Redirect to admin setup after successful login
          setTimeout(() => {
            window.location.href = `${window.location.origin}/admin/setup`;
          }, 1000);
        }
      } else {
        // Magic link authentication
        const magicLinkData = LoginFormSchema.parse(formData);

        const { error } = await supabase.auth.signInWithOtp({
          email: magicLinkData.email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
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
        }
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('error.login_failed'),
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

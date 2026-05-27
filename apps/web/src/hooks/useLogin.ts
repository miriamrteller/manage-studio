import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import { LoginFormSchema, PasswordLoginSchema, type LoginForm, type PasswordLogin } from '@/schemas';
import { resolveAuthErrorMessage } from '@/lib/authErrors';

export type PostLoginRedirect = {
  to?: string;
  state?: Record<string, unknown>;
};

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

export function useLogin(
  redirect: PostLoginRedirect = { to: '/dashboard' },
): LoginState & LoginActions {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
            text: t('pages.login.success_redirecting'),
          });
          // Route through dashboard so role-based redirect + enrollment state are preserved
          setTimeout(() => {
            navigate(redirect.to ?? '/dashboard', {
              replace: true,
              state: redirect.state,
            });
          }, 800);
        }
      } else {
        // Magic link authentication — existing accounts only (no auto-signup on login)
        const magicLinkData = LoginFormSchema.parse(formData);
        const subdomain = resolveTenantSubdomain();

        if (!subdomain) {
          setMessage({
            type: 'error',
            text: t('errors.tenant_subdomain_unresolved'),
          });
          return;
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: magicLinkData.email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              subdomain,
            },
          },
        });

        if (error) {
          setMessage({
            type: 'error',
            text: resolveAuthErrorMessage(error.message, t, 'errors.login_failed'),
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

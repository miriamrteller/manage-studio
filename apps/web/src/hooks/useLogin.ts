import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import {
  LoginFormSchema,
  PasswordLoginSchema,
  loginEmailOtpVerifySchema,
  type LoginForm,
  type PasswordLogin,
} from '@/schemas';
import { resolveAuthErrorMessage } from '@/lib/authErrors';
import { buildAuthCallbackRedirect } from '@/lib/authRedirect';
import { sendLoginEmailOtp, verifyLoginEmailOtp } from '@/lib/loginEmailOtp';

export type PostLoginRedirect = {
  to?: string;
  state?: Record<string, unknown>;
};

/**
 * useLogin: Handles authentication logic (password, magic link, email code)
 * - Manages form submission state (loading, messages)
 * - Calls Supabase password signin, OTP signin, or verifyOtp
 * - Returns form state and submission handler
 *
 * Separation of concerns:
 * - This hook handles all logic: API calls, state, error handling
 * - LoginForm component handles UI rendering only
 * - Pages compose these together
 */

export type AuthMode = 'password' | 'magic_link' | 'code';
export type CodeStep = 'send' | 'verify';
type FormData = LoginForm | PasswordLogin;

export interface LoginState {
  isLoading: boolean;
  message: {
    type: 'success' | 'error';
    text: string;
  } | null;
  codeStep: CodeStep;
  codeEmail: string;
}

export interface LoginActions {
  onSubmit: (_formData: FormData, _authMode: AuthMode) => Promise<void>;
  resetMessage: () => void;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  resendEmailCode: () => Promise<void>;
  backToCodeSend: () => void;
}

export function useLogin(
  redirect: PostLoginRedirect = { to: '/dashboard' },
): LoginState & LoginActions {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<LoginState['message']>(null);
  const [codeStep, setCodeStep] = useState<CodeStep>('send');
  const [codeEmail, setCodeEmail] = useState('');

  const redirectAfterLogin = () => {
    setMessage({
      type: 'success',
      text: t('pages.login.success_redirecting'),
    });
    setTimeout(() => {
      navigate(redirect.to ?? '/dashboard', {
        replace: true,
        state: redirect.state,
      });
    }, 800);
  };

  const sendEmailCode = async (email: string) => {
    setIsLoading(true);
    setMessage(null);

    try {
      const parsed = LoginFormSchema.parse({ email });
      const subdomain = resolveTenantSubdomain();

      if (!subdomain) {
        setMessage({
          type: 'error',
          text: t('errors.tenant_subdomain_unresolved'),
        });
        return;
      }

      const { error } = await sendLoginEmailOtp(
        parsed.email,
        subdomain,
        buildAuthCallbackRedirect('code'),
      );

      if (error) {
        setMessage({
          type: 'error',
          text: resolveAuthErrorMessage(error.message, t, 'errors.login_failed'),
        });
      } else {
        setCodeEmail(parsed.email);
        setCodeStep('verify');
        setMessage({
          type: 'success',
          text: t('pages.login.code_sent'),
        });
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

  const verifyEmailCode = async (code: string) => {
    setIsLoading(true);
    setMessage(null);

    try {
      loginEmailOtpVerifySchema.parse({ email: codeEmail, code });

      const { error } = await verifyLoginEmailOtp(codeEmail, code);

      if (error) {
        setMessage({
          type: 'error',
          text: resolveAuthErrorMessage(
            error.message,
            t,
            'pages.login.invalid_code',
          ),
        });
      } else {
        redirectAfterLogin();
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('pages.login.invalid_code'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resendEmailCode = async () => {
    if (codeEmail) {
      await sendEmailCode(codeEmail);
    }
  };

  const backToCodeSend = () => {
    setCodeStep('send');
    setCodeEmail('');
    setMessage(null);
  };

  const onSubmit = async (formData: FormData, authMode: AuthMode) => {
    if (authMode === 'code') {
      const emailData = LoginFormSchema.parse(formData);
      await sendEmailCode(emailData.email);
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      if (authMode === 'password') {
        const passwordData = PasswordLoginSchema.parse(formData);

        const { error } = await supabase.auth.signInWithPassword({
          email: passwordData.email,
          password: passwordData.password,
        });

        if (error) {
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
          redirectAfterLogin();
        }
      } else {
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
            emailRedirectTo: buildAuthCallbackRedirect('magic_link'),
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
    codeStep,
    codeEmail,
    onSubmit,
    resetMessage,
    sendEmailCode,
    verifyEmailCode,
    resendEmailCode,
    backToCodeSend,
  };
}

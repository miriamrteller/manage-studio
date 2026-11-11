import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import {
  LoginFormSchema,
  PasswordLoginSchema,
  loginEmailOtpVerifySchema,
  type LoginForm,
  type PasswordLogin,
} from '@/schemas';
import { classifyAuthError, resolveAuthErrorMessage } from '@/lib/authErrors';
import { emailCooldownRemaining, rateLimitWaitSeconds, startEmailCooldown } from '@/lib/emailSendCooldown';
import { buildAuthCallbackRedirect } from '@/lib/authRedirect';
import { sendPasswordReset } from '@/features/auth/lib/passwordReset';
import { sendLoginEmailOtp, verifyLoginEmailOtp } from '@/lib/loginEmailOtp';
import { useCaptcha, type Captcha } from '@/components/captcha/useCaptcha';
import { loginOtpOptions } from '@/lib/loginOtpOptions';
import { verifySessionBelongsToTenant } from '@/lib/tenantMembership';
import { prepareClientLogin } from '@/features/auth/lib/clientSignIn';

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
  /** CAPTCHA for the email/password calls; render `captcha.widget` by the submit button. */
  captcha: Captcha;
}

export interface LoginActions {
  onSubmit: (_formData: FormData, _authMode: AuthMode) => Promise<void>;
  resetMessage: () => void;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  resendEmailCode: () => Promise<void>;
  backToCodeSend: () => void;
  /** "Forgot password?": emails a link to set a new password (same message whether or not the account exists). */
  forgotPassword: (email: string) => Promise<void>;
}

export function useLogin(
  redirect: PostLoginRedirect = { to: '/dashboard' },
): LoginState & LoginActions {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<LoginState['message']>(null);
  const [codeStep, setCodeStep] = useState<CodeStep>('send');
  const [codeEmail, setCodeEmail] = useState('');
  const captcha = useCaptcha();

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

  /**
   * Tenant isolation: an account may only sign in on its own studio's
   * subdomain. On a cross-tenant session the session is torn down before
   * any redirect, so e.g. a studioaviv admin never lands inside
   * creativeballet's app. Returns true when the login may proceed.
   */
  const ensureSessionBelongsToTenant = async (): Promise<boolean> => {
    const membership = await verifySessionBelongsToTenant();
    if (membership === 'wrong_tenant') {
      await supabase.auth.signOut();
      setMessage({
        type: 'error',
        text: t('pages.login.wrong_studio'),
      });
      return false;
    }
    return true;
  };

  /**
   * After a sign-in email: wait before the next one (each new email replaces the
   * last). A rate limit means an email was just sent: show the wait, not an error.
   * Returns true when the email went out or one was sent moments ago.
   */
  const afterEmailSend = (
    email: string,
    error: { message: string; status?: number; code?: string } | null,
  ): boolean => {
    if (!error) {
      startEmailCooldown(email, 'sent');
      return true;
    }
    if (
      error.status === 429 ||
      error.code === 'over_email_send_rate_limit' ||
      classifyAuthError(error.message) === 'rate_limited'
    ) {
      startEmailCooldown(email, 'rate_limited', rateLimitWaitSeconds(error.message));
      setMessage(null);
      return true;
    }
    setMessage({
      type: 'error',
      text: resolveAuthErrorMessage(error.message, t, 'errors.login_failed'),
    });
    return false;
  };

  const sendEmailCode = async (email: string) => {
    setIsLoading(true);
    setMessage(null);

    try {
      const parsed = LoginFormSchema.parse({ email });
      // A new code replaces the last one: never send while the wait is on.
      if (emailCooldownRemaining(parsed.email).seconds > 0) {
        setCodeEmail(parsed.email);
        setCodeStep('verify');
        return;
      }
      const otpOptions = loginOtpOptions(i18n.language ?? 'en');

      if (!otpOptions) {
        setMessage({
          type: 'error',
          text: t('errors.tenant_subdomain_unresolved'),
        });
        return;
      }

      // A booked client with no login yet gets one now, so the code reaches them.
      if (otpOptions.data.subdomain) await prepareClientLogin(otpOptions.data.subdomain, parsed.email);

      const { error } = await sendLoginEmailOtp(
        parsed.email,
        otpOptions,
        buildAuthCallbackRedirect('code'),
        captcha.authOptions().captchaToken,
      );
      captcha.reset();

      if (afterEmailSend(parsed.email, error)) {
        // Sent now, or moments ago: either way a code is on its way.
        setCodeEmail(parsed.email);
        setCodeStep('verify');
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
      } else if (await ensureSessionBelongsToTenant()) {
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
          ...(captcha.token ? { options: captcha.authOptions() } : {}),
        });
        captcha.reset();

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
        } else if (await ensureSessionBelongsToTenant()) {
          redirectAfterLogin();
        }
      } else {
        const magicLinkData = LoginFormSchema.parse(formData);
        // A new link replaces the last one: never send while the wait is on.
        if (emailCooldownRemaining(magicLinkData.email).seconds > 0) {
          return;
        }
        const otpOptions = loginOtpOptions(i18n.language ?? 'en');

        if (!otpOptions) {
          setMessage({
            type: 'error',
            text: t('errors.tenant_subdomain_unresolved'),
          });
          return;
        }

        // A booked client with no login yet gets one now, so the link reaches them.
        if (otpOptions.data.subdomain) await prepareClientLogin(otpOptions.data.subdomain, magicLinkData.email);

        const { error } = await supabase.auth.signInWithOtp({
          email: magicLinkData.email,
          options: {
            shouldCreateUser: otpOptions.shouldCreateUser,
            emailRedirectTo: buildAuthCallbackRedirect('magic_link'),
            data: otpOptions.data,
            ...captcha.authOptions(),
          },
        });
        captcha.reset();
        // The form shows "We've sent a link to …" with the countdown.
        afterEmailSend(magicLinkData.email, error);
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

  const forgotPassword = async (email: string) => {
    setIsLoading(true);
    try {
      await sendPasswordReset(email, captcha.authOptions().captchaToken);
      setMessage({ type: 'success', text: t('pages.login.reset_sent', { email: email.trim().toLowerCase() }) });
    } catch (error) {
      const text = error instanceof Error ? error.message : '';
      setMessage({ type: 'error', text: resolveAuthErrorMessage(text, t, 'pages.login.reset_error') });
    } finally {
      captcha.reset();
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    message,
    codeStep,
    codeEmail,
    captcha,
    onSubmit,
    resetMessage,
    sendEmailCode,
    verifyEmailCode,
    resendEmailCode,
    backToCodeSend,
    forgotPassword,
  };
}

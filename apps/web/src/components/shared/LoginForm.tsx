import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  LoginFormSchema,
  PasswordLoginSchema,
  type LoginForm as LoginFormData,
  type PasswordLogin as PasswordLoginData,
} from '@/schemas';
import type { AuthMode, CodeStep } from '@/hooks/useLogin';
import type { Captcha } from '@/components/captcha/useCaptcha';
import { AuthMessage } from './AuthMessage';
import { OtpCodeForm } from './OtpCodeForm';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormInput } from '../ui/form';
import { formatCountdown, useEmailCooldown, type CooldownReason } from '@/lib/emailSendCooldown';

/**
 * LoginForm: Presentational component for login form UI
 * - Handles form rendering and validation display
 * - Supports three authentication modes: password, magic link, email code
 * - Delegates business logic to parent (useLogin hook)
 * - No API calls or state management beyond form state
 *
 * WCAG:
 * - Form labels linked via htmlFor + id
 * - Error messages via aria-describedby
 * - Loading state via aria-busy
 * - Focus management with focus-visible outline
 * - Tab buttons with proper aria-selected state
 */

type FormData = LoginFormData | PasswordLoginData;

interface LoginFormProps {
  isLoading: boolean;
  message: {
    type: 'success' | 'error';
    text: string;
  } | null;
  codeStep: CodeStep;
  codeEmail: string;
  onSubmit: (_formData: FormData, _authMode: AuthMode) => Promise<void>;
  onVerifyEmailCode: (code: string) => Promise<void>;
  onResendEmailCode: () => Promise<void>;
  onBackToCodeSend: () => void;
  onMessageDismiss?: () => void;
  /** CAPTCHA check (from useLogin); shown before each send or sign-in when configured. */
  captcha?: Pick<Captcha, 'widget' | 'ready'>;
  /** Start on this tab (e.g. from "Send me a new link" on an expired-link page). */
  initialMode?: AuthMode;
  /** Prefill the email. */
  initialEmail?: string;
}

/**
 * The wait before another sign-in email: what was sent, and when a new one can
 * be asked for. The countdown is visible text; screen readers hear the message
 * once, and again when the wait is over (not every second).
 */
function EmailCooldownNotice({
  kind,
  email,
  seconds,
  reason,
}: {
  kind: 'link' | 'code';
  email: string;
  seconds: number;
  reason: CooldownReason | null;
}) {
  const { t } = useTranslation();
  const [wasWaiting, setWasWaiting] = useState(false);
  useEffect(() => {
    if (seconds > 0) setWasWaiting(true);
  }, [seconds]);
  const waiting = seconds > 0;
  const visible = !waiting
    ? null
    : reason === 'rate_limited'
      ? t('pages.login.cooldown_rate_limited', { seconds })
      : t(kind === 'link' ? 'pages.login.cooldown_sent_link' : 'pages.login.cooldown_sent_code', {
          email,
          time: formatCountdown(seconds),
        });
  const announced = waiting
    ? reason === 'rate_limited'
      ? t('pages.login.cooldown_sr_rate_limited')
      : t(kind === 'link' ? 'pages.login.cooldown_sr_sent_link' : 'pages.login.cooldown_sr_sent_code', { email })
    : wasWaiting
      ? t('pages.login.cooldown_ready')
      : '';
  return (
    <>
      {visible && (
        <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900" data-testid="email-cooldown">
          {visible}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announced}
      </p>
    </>
  );
}

export function LoginForm({
  isLoading,
  message,
  codeStep,
  codeEmail,
  onSubmit,
  onVerifyEmailCode,
  onResendEmailCode,
  onBackToCodeSend,
  onMessageDismiss,
  captcha,
  initialMode = 'password',
  initialEmail,
}: LoginFormProps) {
  const captchaReady = captcha?.ready ?? true;
  const { t } = useTranslation();
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);

  const schema = authMode === 'password' ? PasswordLoginSchema : LoginFormSchema;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: initialEmail ? ({ email: initialEmail } as FormData) : undefined,
  });

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitted } } = form;
  const typedEmail = (watch('email') as string | undefined) ?? '';
  const showCodeVerifyStep = authMode === 'code' && codeStep === 'verify';
  // The wait applies per email, across reloads, to both links and codes.
  const cooldown = useEmailCooldown(showCodeVerifyStep ? codeEmail : typedEmail);

  const handleAuthModeChange = (mode: AuthMode) => {
    if (authMode === 'code' && mode !== 'code') {
      onBackToCodeSend();
    }
    setAuthMode(mode);
    // Keep the email when switching tabs.
    reset(typedEmail ? ({ email: typedEmail } as FormData) : undefined);
  };

  const handleFormSubmit = async (formData: FormData) => {
    await onSubmit(formData, authMode);
  };

  const handleResendCode = async () => {
    await onResendEmailCode();
  };

  const canResend = cooldown.seconds === 0;
  const emailWaiting = authMode !== 'password' && cooldown.seconds > 0;
  // A link can't be re-sent while waiting; a code can still be entered (nothing is sent).
  const linkBlocked = authMode === 'magic_link' && emailWaiting;

  return (
    <>
      {message && (
        <AuthMessage
          type={message.type}
          text={message.text}
          onDismiss={onMessageDismiss}
          dismissLabel={t('common.dismiss_message')}
        />
      )}

      <Tabs value={authMode} onValueChange={(mode) => handleAuthModeChange(mode as AuthMode)}>
        <TabsList className="mb-6">
          <TabsTrigger value="password" aria-controls="password-panel">
            {t('pages.login.password_tab')}
          </TabsTrigger>
          <TabsTrigger value="magic_link" aria-controls="magic-link-panel">
            {t('pages.login.magic_link_tab')}
          </TabsTrigger>
          <TabsTrigger value="code" aria-controls="code-panel">
            {t('pages.login.code_tab')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {showCodeVerifyStep ? (
        <div className="space-y-6" role="region" aria-label={t('pages.login.verify_code')}>
          <p className="text-center text-sm text-gray-600">
            {t('pages.login.code_sent_to', { email: codeEmail })}
          </p>

          <OtpCodeForm
            onSubmit={({ code }) => onVerifyEmailCode(code)}
            loading={isLoading}
            verifyLabelKey="pages.login.verify_code"
          />

          <EmailCooldownNotice kind="code" email={codeEmail} seconds={cooldown.seconds} reason={cooldown.reason} />

          {canResend && captcha?.widget}

          <Button
            onClick={handleResendCode}
            disabled={!canResend || isLoading || !captchaReady}
            variant="outline"
            className="w-full"
          >
            {isLoading ? t('common.loading') : t('pages.login.resend_code')}
          </Button>

          <Button
            onClick={onBackToCodeSend}
            variant="secondary"
            className="w-full"
          >
            {t('pages.login.back_to_email')}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {authMode === 'code' && (
            <p className="text-sm text-gray-600">{t('pages.login.code_helper')}</p>
          )}

          <FormInput
            htmlFor="email"
            label={t('form.email')}
            type="email"
            placeholder={t('form.email_placeholder')}
            error={isSubmitted ? errors.email?.message : undefined}
            {...register('email')}
          />

          {authMode === 'password' && (
            <FormInput
              htmlFor="password"
              label={t('pages.login.password')}
              type="password"
              placeholder={t('pages.login.password_placeholder')}
              error={
                isSubmitted
                  ? (errors as Record<string, { message?: string }>).password?.message
                  : undefined
              }
              {...register('password' as const)}
            />
          )}

          {authMode !== 'password' && (
            <EmailCooldownNotice
              kind={authMode === 'magic_link' ? 'link' : 'code'}
              email={typedEmail}
              seconds={cooldown.seconds}
              reason={cooldown.reason}
            />
          )}

          {!emailWaiting && captcha?.widget}

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            isLoading={isLoading}
            disabled={(!captchaReady && !emailWaiting) || linkBlocked}
          >
            {isLoading
              ? t('common.loading')
              : authMode === 'password'
                ? t('pages.login.sign_in')
                : authMode === 'magic_link'
                  ? t('pages.login.send_link')
                  : emailWaiting
                    ? t('pages.login.enter_code')
                    : t('pages.login.send_code')}
          </Button>
        </form>
      )}
    </>
  );
}

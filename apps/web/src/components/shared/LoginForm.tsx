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
import { AuthMessage } from './AuthMessage';
import { OtpCodeForm } from './OtpCodeForm';
import { Button } from '@/components/ui/button';
import { FormInput } from '../ui/form';

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
}: LoginFormProps) {
  const { t } = useTranslation();
  const [authMode, setAuthMode] = useState<AuthMode>('password');
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const schema = authMode === 'password' ? PasswordLoginSchema : LoginFormSchema;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitted } } = form;

  useEffect(() => {
    if (authMode === 'code' && codeStep === 'verify') {
      setSecondsRemaining(60);
    }
  }, [authMode, codeStep]);

  useEffect(() => {
    if (authMode !== 'code' || codeStep !== 'verify') return;
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [authMode, codeStep, secondsRemaining]);

  const handleAuthModeChange = (mode: AuthMode) => {
    if (authMode === 'code' && mode !== 'code') {
      onBackToCodeSend();
    }
    setAuthMode(mode);
    reset();
  };

  const handleFormSubmit = async (formData: FormData) => {
    await onSubmit(formData, authMode);
  };

  const handleResendCode = async () => {
    await onResendEmailCode();
    setSecondsRemaining(60);
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const canResend = secondsRemaining === 0;
  const showCodeVerifyStep = authMode === 'code' && codeStep === 'verify';

  return (
    <>
      {message && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onMessageDismiss}
          className="w-full text-left justify-start"
          aria-label={t('common.dismiss_message')}
        >
          <AuthMessage type={message.type} text={message.text} />
        </Button>
      )}

      <div role="tablist" className="flex gap-2 border-b border-gray-300 mb-6">
        <Button
          role="tab"
          variant="ghost"
          aria-selected={authMode === 'password'}
          aria-controls="password-panel"
          onClick={() => handleAuthModeChange('password')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            authMode === 'password'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('pages.login.password_tab')}
        </Button>
        <Button
          role="tab"
          variant="ghost"
          aria-selected={authMode === 'magic_link'}
          aria-controls="magic-link-panel"
          onClick={() => handleAuthModeChange('magic_link')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            authMode === 'magic_link'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('pages.login.magic_link_tab')}
        </Button>
        <Button
          role="tab"
          variant="ghost"
          aria-selected={authMode === 'code'}
          aria-controls="code-panel"
          onClick={() => handleAuthModeChange('code')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            authMode === 'code'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('pages.login.code_tab')}
        </Button>
      </div>

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

          <div className="text-center">
            <p className="text-sm text-gray-600">{t('pages.login.resend_in')}</p>
            <p className="text-2xl font-bold">
              {String(minutes).padStart(2, '0')}:
              {String(seconds).padStart(2, '0')}
            </p>
          </div>

          <Button
            onClick={handleResendCode}
            disabled={!canResend || isLoading}
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

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            isLoading={isLoading}
          >
            {isLoading
              ? t('common.loading')
              : authMode === 'password'
                ? t('pages.login.sign_in')
                : authMode === 'magic_link'
                  ? t('pages.login.send_link')
                  : t('pages.login.send_code')}
          </Button>
        </form>
      )}
    </>
  );
}

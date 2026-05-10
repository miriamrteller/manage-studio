import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { LoginFormSchema, PasswordLoginSchema, type LoginForm as LoginFormData, type PasswordLogin as PasswordLoginData } from '../../schemas';
import { AuthMessage } from './AuthMessage';
import { Button, FormField } from '../Common';

/**
 * LoginForm: Presentational component for login form UI
 * - Handles form rendering and validation display
 * - Supports two authentication modes: password (default) and magic link
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

type AuthMode = 'password' | 'magic_link';
type FormData = LoginFormData | PasswordLoginData;

interface LoginFormProps {
  isLoading: boolean;
  message: {
    type: 'success' | 'error';
    text: string;
  } | null;
  onSubmit: (_formData: FormData, _authMode: AuthMode) => Promise<void>;
  onMessageDismiss?: () => void;
}

export function LoginForm({
  isLoading,
  message,
  onSubmit,
  onMessageDismiss,
}: LoginFormProps) {
  const { t } = useTranslation();
  const [authMode, setAuthMode] = useState<AuthMode>('password');

  // Use different schema based on auth mode
  const schema = authMode === 'password' ? PasswordLoginSchema : LoginFormSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const handleAuthModeChange = (mode: AuthMode) => {
    setAuthMode(mode);
    reset(); // Clear form when switching modes
  };

  const handleFormSubmit = async (formData: FormData) => {
    await onSubmit(formData, authMode);
  };

  return (
    <>
      {/* Message */}
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

      {/* Auth Mode Tabs */}
      <div role="tablist" className="flex gap-2 border-b border-gray-300 mb-6">
        <button
          role="tab"
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
        </button>
        <button
          role="tab"
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
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Email Input */}
        <FormField
          label={t('form.email')}
          id="email"
          error={(errors as any).email?.message}
        >
          <input
            id="email"
            type="email"
            placeholder={t('form.email_placeholder')}
            className="w-full px-4 py-2 border border-gray-300 rounded focus-visible:outline-2 outline-primary outline-offset-2"
            {...register('email')}
            aria-invalid={!!(errors as any).email}
          />
        </FormField>

        {/* Password Input (only visible in password mode) */}
        {authMode === 'password' && (
          <FormField
            label={t('pages.login.password')}
            id="password"
            error={(errors as any).password?.message}
          >
            <input
              id="password"
              type="password"
              placeholder={t('pages.login.password_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded focus-visible:outline-2 outline-primary outline-offset-2"
              {...register('password')}
              aria-invalid={!!(errors as any).password}
            />
          </FormField>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          isLoading={isLoading}
        >
          {isLoading ? t('common.loading') : 
           authMode === 'password' ? t('pages.login.sign_in') : t('pages.login.send_link')}
        </Button>
      </form>
    </>
  );
}

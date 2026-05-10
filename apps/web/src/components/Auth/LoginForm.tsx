import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { LoginFormSchema, type LoginForm as LoginFormData } from '../../schemas';
import { AuthMessage } from './AuthMessage';

/**
 * LoginForm: Presentational component for login form UI
 * - Handles form rendering and validation display
 * - Delegates business logic to parent (useLogin hook)
 * - No API calls or state management beyond form state
 * 
 * WCAG:
 * - Form labels linked via htmlFor + id
 * - Error messages via aria-describedby
 * - Loading state via aria-busy
 * - Focus management with focus-visible outline
 */

interface LoginFormProps {
  isLoading: boolean;
  message: {
    type: 'success' | 'error';
    text: string;
  } | null;
  onSubmit: (formData: LoginFormData) => Promise<void>; // eslint-disable-line no-unused-vars
  onMessageDismiss?: () => void;
}

export function LoginForm({
  isLoading,
  message,
  onSubmit,
  onMessageDismiss,
}: LoginFormProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginFormSchema),
  });

  return (
    <>
      {/* Message */}
      {message && (
        <button
          type="button"
          onClick={onMessageDismiss}
          className="w-full text-left"
          aria-label={t('common.dismiss_message')}
        >
          <AuthMessage type={message.type} text={message.text} />
        </button>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email Input */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t('form.email')}
          </label>
          <input
            id="email"
            type="email"
            placeholder={t('form.email_placeholder')}
            className={`w-full px-4 py-2 border rounded focus-visible:outline-2 outline-primary outline-offset-2 ${
              errors.email
                ? 'border-red-500 bg-red-50'
                : 'border-gray-300'
            }`}
            {...register('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-red-600 mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-4 py-2 bg-primary text-white rounded font-medium hover:bg-opacity-90 disabled:opacity-50 focus-visible:outline-2 outline-white outline-offset-2"
          aria-busy={isLoading}
        >
          {isLoading ? t('common.loading') : t('pages.login.send_link')}
        </button>
      </form>
    </>
  );
}

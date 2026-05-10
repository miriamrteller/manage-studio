import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { LoginFormSchema, type LoginForm as LoginFormData } from '../../schemas';
import { AuthMessage } from './AuthMessage';
import { Button, FormField } from '../Common';

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
  onSubmit: (_formData: LoginFormData) => Promise<void>;
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

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email Input */}
        <FormField
          label={t('form.email')}
          id="email"
          error={errors.email?.message}
        >
          <input
            id="email"
            type="email"
            placeholder={t('form.email_placeholder')}
            className="w-full px-4 py-2 border border-gray-300 rounded focus-visible:outline-2 outline-primary outline-offset-2"
            {...register('email')}
            aria-invalid={!!errors.email}
          />
        </FormField>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          isLoading={isLoading}
        >
          {isLoading ? t('common.loading') : t('pages.login.send_link')}
        </Button>
      </form>
    </>
  );
}

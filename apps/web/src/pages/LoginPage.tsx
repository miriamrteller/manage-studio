import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../lib/supabase';

/**
 * LoginPage: Magic link authentication
 * - Email-only login (no password)
 * - Sends magic link to email
 * - User clicks link to establish session
 * - WCAG: Form labels, error messages, focus management
 */

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setMessage(null);

    try {
      // Send magic link
      const { error } = await supabase.auth.signInWithOtp({
        email: data.email,
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
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: t('error.unexpected'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-primary mb-2 text-center">
          {t('pages.login.title')}
        </h1>
        <p className="text-gray-600 text-center mb-8">
          {t('pages.login.subtitle')}
        </p>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
            role="alert"
            aria-live="polite"
          >
            {message.text}
          </div>
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

        {/* Help Text */}
        <p className="text-sm text-gray-600 text-center mt-6">
          {t('pages.login.no_account')}{' '}
          <button
            onClick={() => navigate('/signup')}
            className="text-primary hover:underline focus-visible:outline-2 outline-primary outline-offset-2"
          >
            {t('pages.login.signup')}
          </button>
        </p>
      </div>
    </div>
  );
}

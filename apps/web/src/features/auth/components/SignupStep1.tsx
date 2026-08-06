'use client';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SignupForm } from '@/schemas/auth';

interface SignupStep1Props {
  onSubmit: () => void;
  loading?: boolean;
}

// Signup is email-only for now: the SMS/WhatsApp path needs Twilio (deferred)
// and its verify step invokes a `verify-otp` Edge Function that does not exist.
export default function SignupStep1({ onSubmit, loading }: SignupStep1Props) {
  const { t } = useTranslation();
  const { register, formState: { errors } } = useFormContext<SignupForm>();

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label={t('signup.step1.subtitle')}>
      <h2 className="sr-only">{t('signup.step1.subtitle')}</h2>
      <div className="space-y-2">
        <Label htmlFor="firstName">{t('signup.step1.firstName')}</Label>
        <Input
          id="firstName"
          {...register('firstName')}          aria-required="true"          aria-describedby={errors.firstName ? 'firstName-error' : undefined}
        />
        {errors.firstName && (
          <p id="firstName-error" className="text-sm text-red-600" role="alert">
            {errors.firstName.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="lastName">{t('signup.step1.lastName')}</Label>
        <Input
          id="lastName"
          {...register('lastName')}          aria-required="true"          aria-describedby={errors.lastName ? 'lastName-error' : undefined}
        />
        {errors.lastName && (
          <p id="lastName-error" className="text-sm text-red-600" role="alert">
            {errors.lastName.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('signup.step1.email')}</Label>
        <Input
          id="email"
          type="email"
          {...register('email')}          aria-required="true"          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-red-600" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t('common.loading') : t('signup.step1.continue')}
      </Button>
    </form>
  );
}

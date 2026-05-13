'use client';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/PhoneInput';
import type { SignupForm } from '@/schemas/auth';

interface SignupStep1Props {
  onSubmit: () => void;
  loading?: boolean;
}

export default function SignupStep1({ onSubmit, loading }: SignupStep1Props) {
  const { t } = useTranslation();
  const { register, watch, formState: { errors } } = useFormContext<SignupForm>();

  const channel = watch('channel');
  const showPhoneField = channel === 'sms' || channel === 'whatsapp';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="firstName">{t('signup.step1.firstName')}</Label>
        <Input
          id="firstName"
          {...register('firstName')}
          aria-describedby={errors.firstName ? 'firstName-error' : undefined}
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
          {...register('lastName')}
          aria-describedby={errors.lastName ? 'lastName-error' : undefined}
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
          {...register('email')}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-red-600" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Label>{t('signup.step1.channel')}</Label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              value="email"
              {...register('channel')}
              className="me-2"
            />
            <span>{t('signup.step1.channelEmail')}</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="sms"
              {...register('channel')}
              className="me-2"
            />
            <span>{t('signup.step1.channelSms')}</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="whatsapp"
              {...register('channel')}
              className="me-2"
            />
            <span>{t('signup.step1.channelWhatsapp')}</span>
          </label>
        </div>
      </div>

      {showPhoneField && (
        <PhoneInput
          name="phone"
          label={t('signup.step1.phone')}
          required={showPhoneField}
        />
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t('common.loading') : t('signup.step1.continue')}
      </Button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { signupFormSchema, type SignupForm } from '@/schemas/auth';
import { useSignup } from '@/hooks/useSignup';
import SignupStep1 from '@/features/auth/components/SignupStep1';
import SignupStep2 from '@/features/auth/components/SignupStep2';
import SignupStep3 from '@/features/auth/components/SignupStep3';

type SignupStep = 1 | 2 | 3;

export default function SignupPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [step, setStep] = useState<SignupStep>(1);
  const [contactPoint, setContactPoint] = useState<string>('');

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupFormSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      channel: 'email',
      tenantId: tenant?.id || '',
    },
  });

  const { sendOtp, sendOtpLoading, sendOtpError, verifyOtp, verifyOtpLoading } =
    useSignup();

  const onSubmitStep1 = form.handleSubmit((data) => {
    if (!data.email || !data.firstName || !data.lastName) {
      return;
    }

    const contact = data.channel === 'email' ? data.email : data.phone;
    setContactPoint(contact || '');

    sendOtp(data);
    setStep(2);
  });

  const onSubmitStep2 = () => {
    setStep(3);
  };

  const onSubmitStep3 = (_data: { code: string }) => {
    if (contactPoint && _data.code) {
      const channel = form.getValues('channel');
      verifyOtp({
        contactPoint,
        code: _data.code,
        channel,
      });
    }
  };

  if (!tenant) {
    return <div>{t('error.loading_tenant')}</div>;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4"
    >
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-center text-2xl font-bold tracking-tight">
            {t('signup.title')}
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t(`signup.step${step}.subtitle`)}
          </p>
        </div>

        <FormProvider {...form}>
          {step === 1 && (
            <SignupStep1 onSubmit={onSubmitStep1} loading={sendOtpLoading} />
          )}
          {step === 2 && (
            <SignupStep2
              channel={form.getValues('channel')}
              contactPoint={contactPoint}
              onSubmit={onSubmitStep2}
            />
          )}
          {step === 3 && (
            <SignupStep3 onSubmit={onSubmitStep3} loading={verifyOtpLoading} />
          )}
        </FormProvider>

        {sendOtpError && (
          <div className="rounded-md bg-red-50 p-4" role="alert" aria-live="polite">
            <p className="text-sm font-medium text-red-800">
              {t('error.signup_failed')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

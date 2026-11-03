'use client';

import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTenantQuery } from '@/hooks/useTenant';
import { signupFormSchema, type SignupForm } from '@/schemas/auth';
import { useSignup } from '@/features/auth/hooks/useSignup';
import { resolveAuthErrorMessage } from '@/lib/authErrors';
import SignupStep1 from '@/features/auth/components/SignupStep1';
import SignupStep2 from '@/features/auth/components/SignupStep2';
import SignupStep3 from '@/features/auth/components/SignupStep3';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { useCaptcha } from '@/components/captcha/useCaptcha';

type SignupStep = 1 | 2 | 3;

export default function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant, isLoading: tenantLoading } = useTenantQuery();
  const [step, setStep] = useState<SignupStep>(1);
  const [contactPoint, setContactPoint] = useState<string>('');
  const [channel, setChannel] = useState<SignupForm['channel']>('email');
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const captcha = useCaptcha();

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupFormSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      channel: 'email',
    },
  });

  const {
    sendOtpAsync,
    sendOtpLoading,
    sendOtpError,
    verifyOtp,
    verifyOtpLoading,
  } = useSignup();

  /** The email path goes through Supabase Auth, which needs a CAPTCHA token once it is on. */
  const sendCode = async (data: SignupForm) => {
    if (data.channel !== 'email') return sendOtpAsync(data);
    try {
      return await sendOtpAsync({ ...data, ...captcha.authOptions() });
    } finally {
      captcha.reset();
    }
  };

  const onSubmitStep1 = form.handleSubmit(async (data) => {
    if (data.channel === 'email' && !captcha.ready) {
      setCaptchaMissing(true);
      return;
    }
    setCaptchaMissing(false);
    try {
      const contact = data.channel === 'email' ? data.email : data.phone;
      await sendCode(data);
      setContactPoint(contact || '');
      setChannel(data.channel);
      setStep(2);
    } catch {
      // Error surfaced via sendOtpError
    }
  });

  const onSubmitStep2 = () => {
    setStep(3);
  };

  const onResend = async () => {
    const values = form.getValues();
    if (values.channel === 'email' && !captcha.ready) {
      setCaptchaMissing(true);
      return;
    }
    setCaptchaMissing(false);
    await sendCode(values);
  };

  const onSubmitStep3 = (_data: { code: string }) => {
    if (contactPoint && _data.code) {
      verifyOtp({
        contactPoint,
        code: _data.code,
        channel,
      });
    }
  };

  if (!tenant) {
    // Still looking up the studio, or the lookup failed: never wait forever.
    return (
      <div className="p-6 text-center" role="status">
        {tenantLoading ? t('errors.loading_tenant') : t('errors.studio_load_failed')}
      </div>
    );
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
            <>
              <SignupStep1 onSubmit={onSubmitStep1} loading={sendOtpLoading} />
              {captcha.widget}
              <PrivacyNotice purpose="signup" className="mt-3" />
            </>
          )}
          {step === 2 && channel === 'email' && captcha.widget}
          {step === 2 && (
            <SignupStep2
              channel={channel}
              contactPoint={contactPoint}
              onContinue={channel === 'email' ? undefined : onSubmitStep2}
              onResend={onResend}
              resendLoading={sendOtpLoading}
              onBackToLogin={() => navigate('/login')}
            />
          )}
          {step === 3 && channel !== 'email' && (
            <SignupStep3 onSubmit={onSubmitStep3} loading={verifyOtpLoading} />
          )}
        </FormProvider>

        {captchaMissing && (
          <p className="text-sm text-red-700" role="alert">{t('common.captcha_needed')}</p>
        )}

        {sendOtpError && (
          <Alert variant="destructive">
            <p className="text-sm font-medium">
              {sendOtpError instanceof Error
                ? resolveAuthErrorMessage(sendOtpError.message, t, 'errors.signup_failed')
                : t('errors.signup_failed')}
            </p>
          </Alert>
        )}
      </div>
    </div>
  );
}

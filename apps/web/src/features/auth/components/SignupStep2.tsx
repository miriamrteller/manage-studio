'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface SignupStep2Props {
  channel: 'email' | 'sms' | 'whatsapp';
  contactPoint: string;
  onContinue?: () => void;
  onResend?: () => void | Promise<void>;
  resendLoading?: boolean;
  onBackToLogin?: () => void;
}

export default function SignupStep2({
  channel,
  contactPoint,
  onContinue,
  onResend,
  resendLoading,
  onBackToLogin,
}: SignupStep2Props) {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const isMagicLink = channel === 'email';

  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const canResend = secondsRemaining === 0;

  const handleResend = async () => {
    await onResend?.();
    setSecondsRemaining(60);
  };

  return (
    <div className="space-y-6" role="region" aria-label={t('signup.step2.subtitle')}>
      <h2 className="sr-only">{t('signup.step2.subtitle')}</h2>
      <div className="rounded-md bg-blue-50 p-4" role="status" aria-live="polite">
        <p className="text-sm text-blue-800">
          {isMagicLink
            ? t('signup.step2.magicLinkSent', { contact: contactPoint })
            : t('signup.step2.sentTo', {
                channel: t(`signup.step2.${channel}`),
                contact: contactPoint,
              })}
        </p>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          {t(isMagicLink ? 'signup.step2.resendLinkIn' : 'signup.step2.resendIn')}
        </p>
        <p className="text-2xl font-bold">
          {String(minutes).padStart(2, '0')}:
          {String(seconds).padStart(2, '0')}
        </p>
      </div>

      <Button
        onClick={handleResend}
        disabled={!canResend || resendLoading}
        variant="outline"
        className="w-full"
      >
        {resendLoading
          ? t('common.loading')
          : t(isMagicLink ? 'signup.step2.resendLink' : 'signup.step2.resend')}
      </Button>

      {isMagicLink ? (
        onBackToLogin && (
          <Button onClick={onBackToLogin} variant="secondary" className="w-full">
            {t('common.back_to_login')}
          </Button>
        )
      ) : (
        onContinue && (
          <Button onClick={onContinue} className="w-full">
            {t('signup.step2.continue')}
          </Button>
        )
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface SignupStep2Props {
  channel: 'email' | 'sms' | 'whatsapp';
  contactPoint: string;
  onSubmit: () => void;
}

export default function SignupStep2({
  channel,
  contactPoint,
  onSubmit,
}: SignupStep2Props) {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState(300);

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

  const handleResend = () => {
    setSecondsRemaining(300);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          {t('signup.step2.sentTo', {
            channel: t(`signup.step2.${channel}`),
            contact: contactPoint,
          })}
        </p>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          {t('signup.step2.resendIn')}
        </p>
        <p className="text-2xl font-bold">
          {String(minutes).padStart(2, '0')}:
          {String(seconds).padStart(2, '0')}
        </p>
      </div>

      <Button
        onClick={handleResend}
        disabled={!canResend}
        variant="outline"
        className="w-full"
      >
        {t('signup.step2.resend')}
      </Button>

      <Button onClick={onSubmit} className="w-full">
        {t('signup.step2.continue')}
      </Button>
    </div>
  );
}

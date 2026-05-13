'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface SignupStep3Props {
  onSubmit: (data: { code: string }) => void;
  loading?: boolean;
}

export default function SignupStep3({ onSubmit, loading }: SignupStep3Props) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== '')) {
      const code = newDigits.join('');
      onSubmit({ code });
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = digits.join('');
        if (code.length === 6) onSubmit({ code });
      }}
      className="space-y-6"
      aria-label={t('signup.step3.subtitle')}
    >
      <h2 className="sr-only">{t('signup.step3.subtitle')}</h2>
      <p className="text-center text-sm text-gray-600" id="otp-instruction">
        {t('signup.step3.enterCode')}
      </p>

      <fieldset className="flex justify-center gap-2">
        <legend className="sr-only">{t('signup.step3.enterCode')}</legend>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            aria-label={t('signup.step3.digit', { number: index + 1 })}
            aria-required="true"
            aria-describedby="otp-instruction"
            className="h-12 w-12 text-center text-2xl border border-gray-300 rounded-lg"
          />
        ))}
      </fieldset>

      <Button
        type="submit"
        disabled={loading || digits.some((d) => !d)}
        className="w-full"
        aria-label={loading ? t('common.verifying') : t('signup.step3.verify')}
      >
        {loading ? t('common.verifying') : t('signup.step3.verify')}
      </Button>
    </form>
  );
}

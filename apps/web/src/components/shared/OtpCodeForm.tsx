'use client';

import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Supabase email OTP is usually 6 digits; some projects emit up to 8. */
export const EMAIL_OTP_MIN_LENGTH = 6;
export const EMAIL_OTP_MAX_LENGTH = 8;

export function isValidEmailOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${EMAIL_OTP_MIN_LENGTH},${EMAIL_OTP_MAX_LENGTH}}$`).test(code);
}

export interface OtpCodeFormProps {
  onSubmit: (data: { code: string }) => void;
  loading?: boolean;
  instructionKey?: string;
  verifyLabelKey?: string;
  ariaLabelKey?: string;
  /** Hidden field + paste-friendly input for SMS WebOTP / email paste. */
  showOneTimeCodeAutocomplete?: boolean;
}

export function OtpCodeForm({
  onSubmit,
  loading,
  instructionKey = 'signup.step3.enterCode',
  verifyLabelKey = 'signup.step3.verify',
  ariaLabelKey = 'signup.step3.subtitle',
  showOneTimeCodeAutocomplete = true,
}: OtpCodeFormProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  const handleChange = (value: string) => {
    setCode(value.replace(/\D/g, '').slice(0, EMAIL_OTP_MAX_LENGTH));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isValidEmailOtpCode(code)) {
      onSubmit({ code });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      aria-label={t(ariaLabelKey)}
    >
      <h2 className="sr-only">{t(ariaLabelKey)}</h2>
      <p className="text-center text-sm text-gray-600" id="otp-instruction">
        {t(instructionKey)}
      </p>

      <FormInput
        id="otp-code"
        label={t('common.verification_code')}
        value={code}
        onChange={handleChange}
        autoComplete={showOneTimeCodeAutocomplete ? 'one-time-code' : 'off'}
        inputMode="numeric"
        pattern={`[0-9]{${EMAIL_OTP_MIN_LENGTH},${EMAIL_OTP_MAX_LENGTH}}`}
        maxLength={EMAIL_OTP_MAX_LENGTH}
        aria-describedby="otp-instruction"
      />

      <Button
        type="submit"
        disabled={loading || !isValidEmailOtpCode(code)}
        className="w-full"
        aria-label={loading ? t('common.verifying') : t(verifyLabelKey)}
      >
        {loading ? t('common.verifying') : t(verifyLabelKey)}
      </Button>
    </form>
  );
}

interface FormInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  inputMode?: 'numeric' | 'text';
  pattern?: string;
  maxLength?: number;
  'aria-describedby'?: string;
}

function FormInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  inputMode,
  pattern,
  maxLength,
  'aria-describedby': ariaDescribedBy,
}: FormInputProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        maxLength={maxLength}
        aria-describedby={ariaDescribedBy}
        aria-required="true"
        className="w-full h-12 px-4 text-center text-2xl tracking-widest border border-gray-300 rounded-lg"
        placeholder={'•'.repeat(EMAIL_OTP_MIN_LENGTH)}
      />
    </div>
  );
}

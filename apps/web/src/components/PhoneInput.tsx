'use client';

import { useCallback } from 'react';
import { parsePhoneNumber } from 'libphonenumber-js';
import { useFormContext } from 'react-hook-form';
import { useTenant } from '@/hooks/useTenant';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PhoneInputProps {
  name: string;
  label: string;
  required?: boolean;
}

export function PhoneInput({ name, label, required }: PhoneInputProps) {
  const { watch, setValue } = useFormContext();
  const tenant = useTenant();
  const value = watch(name);

  const formatToE164 = useCallback(
    (inputValue: string) => {
      if (!inputValue) return '';
      try {
        const parsed = parsePhoneNumber(
          inputValue,
          tenant?.country || 'IL'
        );
        return parsed?.isValid() ? parsed.format('E.164') : inputValue;
      } catch {
        return inputValue;
      }
    },
    [tenant?.country]
  );

  const handleBlur = useCallback(() => {
    const formatted = formatToE164(value);
    if (formatted !== value) setValue(name, formatted);
  }, [value, formatToE164, setValue, name]);

  const displayValue = (() => {
    if (!value) return '';
    try {
      const parsed = parsePhoneNumber(
        value,
        tenant?.country || 'IL'
      );
      return parsed?.formatNational() || value;
    } catch {
      return value;
    }
  })();

  return (
    <div className="space-y-2">
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="tel"
        value={displayValue}
        onChange={(e) => setValue(name, e.target.value)}
        onBlur={handleBlur}
        dir="ltr"
        aria-label={label}
        aria-required={required}
        aria-describedby={`${name}-error`}
        placeholder="050 123 4567"
      />
    </div>
  );
}

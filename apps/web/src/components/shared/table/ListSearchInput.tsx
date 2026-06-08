import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ListSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  isSearching?: boolean;
  placeholder?: string;
  id?: string;
  debounceMs?: number;
}

export function ListSearchInput({
  value,
  onChange,
  isSearching = false,
  placeholder,
  id = 'list-search',
  debounceMs = 300,
}: ListSearchInputProps) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value);
  const label = placeholder ?? t('common.search');

  useEffect(() => {
    const timer = setTimeout(() => onChange(localValue), debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        placeholder={label}
        value={localValue}
        onChange={handleChange}
        disabled={isSearching}
        className="form-input flex-1"
        aria-label={label}
      />
      {localValue && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={isSearching}
          aria-label={t('common.clear')}
          className="text-gray-500"
          title={t('common.clear')}
        >
          ✕
        </Button>
      )}
    </div>
  );
}

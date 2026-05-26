import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ListSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  isSearching?: boolean;
  placeholder?: string;
  id?: string;
}

export function ListSearchInput({
  value,
  onChange,
  isSearching = false,
  placeholder,
  id = 'list-search',
}: ListSearchInputProps) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value);
  const label = placeholder ?? t('common.search');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
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

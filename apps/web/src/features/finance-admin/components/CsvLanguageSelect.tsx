import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { CsvLanguage } from '../lib/csvLanguage';

/** "File language: עברית / English" next to a CSV download. */
export function CsvLanguageSelect({
  value,
  onChange,
}: {
  value: CsvLanguage;
  onChange: (value: CsvLanguage) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1 block font-medium">{t('finance.csv.language')}</span>
      <select
        id={id}
        className="rounded border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value === 'he' ? 'he' : 'en')}
      >
        <option value="he">עברית</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

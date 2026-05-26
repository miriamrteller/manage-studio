import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface AgeRangeFilterProps {
  minAge: number | null;
  maxAge: number | null;
  onMinChange: (value: number | null) => void;
  onMaxChange: (value: number | null) => void;
  onClear: () => void;
}

export function AgeRangeFilter({
  minAge,
  maxAge,
  onMinChange,
  onMaxChange,
  onClear,
}: AgeRangeFilterProps) {
  const { t } = useTranslation();
  const hasValue = minAge != null || maxAge != null;

  const parseAge = (raw: string): number | null => {
    if (raw === '') return null;
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-24">
        <label htmlFor="age-min" className="block text-sm font-medium mb-1">
          {t('common.filters.age_min')}
        </label>
        <input
          id="age-min"
          type="number"
          min={0}
          max={120}
          value={minAge ?? ''}
          onChange={(e) => onMinChange(parseAge(e.target.value))}
          className="form-input w-full"
          placeholder={t('common.filters.age_min')}
        />
      </div>
      <div className="min-w-24">
        <label htmlFor="age-max" className="block text-sm font-medium mb-1">
          {t('common.filters.age_max')}
        </label>
        <input
          id="age-max"
          type="number"
          min={0}
          max={120}
          value={maxAge ?? ''}
          onChange={(e) => onMaxChange(parseAge(e.target.value))}
          className="form-input w-full"
          placeholder={t('common.filters.age_max')}
        />
      </div>
      {hasValue && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="mb-0.5">
          {t('common.clear')}
        </Button>
      )}
    </div>
  );
}

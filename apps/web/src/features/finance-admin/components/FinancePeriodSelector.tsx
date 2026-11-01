import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import type { FinancePeriodKey } from '@shared/schemas';
import { parseFinancePeriodKey } from '../lib/periods';

const PERIOD_OPTIONS: FinancePeriodKey[] = ['month_current', 'month_previous', 'season_active'];

export function FinancePeriodSelector() {
  const { t } = useTranslation();
  const { vertical } = useEntityLabels();
  // Photographers have no terms/seasons: only the month options apply.
  const options =
    vertical === 'photographer' ? PERIOD_OPTIONS.filter((key) => key !== 'season_active') : PERIOD_OPTIONS;
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parseFinancePeriodKey(searchParams.get('period'));

  const handleChange = (value: FinancePeriodKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <label className="block text-sm">
      <span className="block font-medium mb-1">{t('finance.period.month_current')}</span>
      <select
        className="border rounded px-3 py-2"
        value={period}
        onChange={(e) => handleChange(e.target.value as FinancePeriodKey)}
        aria-label={t('finance.period.month_current')}
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {t(`finance.period.${key}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useFinancePeriodFromUrl(): FinancePeriodKey {
  const [searchParams] = useSearchParams();
  return parseFinancePeriodKey(searchParams.get('period'));
}

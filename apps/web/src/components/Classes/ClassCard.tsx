import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@shared/format';
import type { PublicClass } from '../../schemas';

/**
 * ClassCard: Presentational component for individual class display
 * - Shows class info (time, capacity, price)
 * - Enrol button delegates to navigation
 * - No state management or hooks (except useTranslation and useNavigate for UI)
 * 
 * WCAG: Proper button labels with class name
 */

interface ClassCardProps {
  class: PublicClass;
  locale: string;
  currency: string;
}

export function ClassCard({ class: cls, locale, currency }: ClassCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleEnrol = () => {
    navigate('/login');
  };

  return (
    <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
      <h3 className="font-bold text-lg mb-2">{cls.name}</h3>

      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <p>
          <span className="font-semibold">{t('time')}:</span> {cls.start_time} –{' '}
          {cls.end_time}
        </p>
        <p>
          <span className="font-semibold">{t('capacity')}:</span>{' '}
          {cls.max_capacity}
        </p>
        <p className="text-lg font-semibold text-primary">
          {formatCurrency(cls.price_minor, currency, locale)}
        </p>
      </div>

      <button
        onClick={handleEnrol}
        aria-label={`${t('enrol')} - ${cls.name}`}
        className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2 font-medium"
      >
        {t('enrol')}
      </button>
    </div>
  );
}

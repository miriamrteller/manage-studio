import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatTime } from '@shared/format';
import type { PublicClass } from '@/schemas';

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
  currency: string;
}

export function ClassCard({ class: cls, currency }: ClassCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const handleEnrol = () => {
    navigate('/login', {
      state: { from: '/classes', classId: cls.id },
    });
  };

  return (
    <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* h2 because ClassCard is a direct subsection of the main page h1 */}
      <h2 className="font-bold text-lg mb-2">{cls.name}</h2>

      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <p>
          <span className="font-semibold">{t('pages.classes.time')}:</span>{' '}
          {formatTime(cls.start_time, i18n.language)} – {formatTime(cls.end_time, i18n.language)}
        </p>
        <p>
          <span className="font-semibold">{t('pages.classes.capacity')}:</span>{' '}
          {cls.max_capacity}
        </p>
        <p className="text-lg font-semibold text-primary">
          {formatCurrency(cls.price_minor, currency, i18n.language)}
        </p>
      </div>

      <button
        onClick={handleEnrol}
        aria-label={`${t('pages.classes.enrol')} - ${cls.name}`}
        className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2 font-medium"
      >
        {t('pages.classes.enrol')}
      </button>
    </div>
  );
}

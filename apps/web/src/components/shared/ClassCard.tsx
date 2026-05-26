import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatTime } from '@shared/format';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { PublicClass } from '@/schemas';

function formatAgeRange(minAge?: number | null, maxAge?: number | null): string | null {
  if (minAge != null && maxAge != null) return `Ages ${minAge}–${maxAge}`;
  if (minAge != null) return `Ages ${minAge}+`;
  if (maxAge != null) return `Up to age ${maxAge}`;
  return null;
}

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
  const { user, isLoading } = useCurrentUser();

  const handleEnrol = () => {
    if (isLoading) {
      return;
    }

    const intent = {
      from: '/enrol' as const,
      classId: cls.id,
      termId: cls.term_id,
    };

    if (user) {
      navigate('/enrol', { state: intent });
      return;
    }

    navigate('/login', { state: intent });
  };

  const ageRange = formatAgeRange(cls.min_age, cls.max_age);

  return (
    <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* h2 because ClassCard is a direct subsection of the main page h1 */}
      <h2 className="font-bold text-lg mb-2">{cls.name}</h2>

      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <p>
          <span className="font-semibold">{t('pages.classes.time')}:</span>{' '}
          {formatTime(cls.start_time, i18n.language)} – {formatTime(cls.end_time, i18n.language)}
        </p>
        {cls.level_name && (
          <p>
            <span className="font-semibold">{t('pages.classes.level')}:</span>{' '}
            {cls.level_name}
          </p>
        )}
        {ageRange && (
          <p>
            <span className="font-semibold">{t('pages.classes.ages')}:</span>{' '}
            {ageRange}
          </p>
        )}
        <p className="text-lg font-semibold text-primary">
          {formatCurrency(cls.price_minor, currency, i18n.language)}
        </p>
      </div>

      <Button
        variant="primary"
        fullWidth
        onClick={handleEnrol}
        disabled={isLoading}
        aria-label={`${t('pages.classes.enrol')} - ${cls.name}`}
      >
        {t('pages.classes.enrol')}
      </Button>
    </div>
  );
}

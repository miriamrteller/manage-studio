import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatTime } from '@shared/format';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { computeClassTotal } from '@/features/enrolment/lib/computeClassTotal';
import type { PublicOffering } from '@/schemas';

/**
 * ClassCard: Presentational component for individual class display
 * - Shows class info (time, capacity, price)
 * - Enrol button delegates to navigation
 * - No state management or hooks (except useTranslation and useNavigate for UI)
 *
 * WCAG: Proper button labels with class name
 */

interface ClassCardProps {
  class: PublicOffering;
  currency: string;
}

export function ClassCard({ class: cls, currency }: ClassCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isLoading } = useCurrentUser();
  const tenant = useTenant();
  const displayMinor =
    tenant != null
      ? computeClassTotal({ price_minor: cls.price_minor }, tenant).chargeMinor
      : cls.price_minor;

  const handleEnrol = () => {
    if (isLoading) {
      return;
    }

    const intent = {
      from: '/enrol' as const,
      classId: cls.id,
      seasonId: cls.season_id,
    };

    navigate('/enrol', { state: intent });
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
        {cls.category_name && (
          <p>
            <span className="font-semibold">{t('pages.classes.level')}:</span>{' '}
            {cls.category_name}
          </p>
        )}

        <p className="text-lg font-semibold text-primary">
          {formatCurrency(displayMinor, currency, i18n.language)}
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

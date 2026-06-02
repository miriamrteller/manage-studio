import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatTime } from '@shared/format';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { computeClassTotal } from '@/features/enrolment/lib/computeClassTotal';
import { formatClassAgeRange } from '@/features/classes/lib/formatClassAgeRange';
import { getOfferingCoverPublicUrl } from '@/features/classes/lib/offeringImageStorage';
import type { PublicOffering } from '@/schemas';

/**
 * ClassCard: Presentational component for individual class display
 * - Shows class info (time, capacity, price)
 * - Enrol button for parents/guests; view-students for admins
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
  const { user, isLoading } = useCurrentUser();
  const tenant = useTenant();
  const isAdmin = user?.role.includes('tenant_admin') ?? false;
  const displayMinor =
    tenant != null
      ? computeClassTotal({ price_minor: cls.price_minor }, tenant).chargeMinor
      : cls.price_minor;

  const handlePrimaryAction = () => {
    if (isLoading) {
      return;
    }

    if (isAdmin) {
      navigate(`/admin/students?class=${cls.id}`);
      return;
    }

    const intent = {
      from: '/enrol' as const,
      classId: cls.id,
      seasonId: cls.season_id,
    };

    navigate('/enrol', { state: intent });
  };

  const actionLabel = isAdmin ? t('pages.classes.view_students') : t('pages.classes.enrol');
  const ageLabel = formatClassAgeRange(t, cls.min_age, cls.max_age);
  const coverUrl = getOfferingCoverPublicUrl(cls.cover_image_path, cls.updated_at);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="w-full h-40 object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-40 bg-gray-100" aria-hidden />
      )}

      <div className="p-6">
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
          {ageLabel && (
            <p>
              <span className="font-semibold">{t('pages.classes.ages')}:</span>{' '}
              {ageLabel}
            </p>
          )}

          <p className="text-lg font-semibold text-primary">
            {formatCurrency(displayMinor, currency, i18n.language)}
          </p>
        </div>

        <Button
          variant="primary"
          fullWidth
          onClick={handlePrimaryAction}
          disabled={isLoading}
          aria-label={`${actionLabel} - ${cls.name}`}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

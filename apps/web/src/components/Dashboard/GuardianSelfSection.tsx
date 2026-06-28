import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { GuardianProfile } from '@/features/enrolment/onboardingService';
import { EnrolmentRow } from './EnrolmentRow';
import type { EngagementWithOffering } from './useParentPortal';

interface GuardianSelfSectionProps {
  guardian: GuardianProfile;
  enrolments: EngagementWithOffering[];
  highlightedEngagementId?: string;
  onEnrol: () => void;
}

export function GuardianSelfSection({
  guardian,
  enrolments,
  highlightedEngagementId,
  onEnrol,
}: GuardianSelfSectionProps) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="portal-myself-heading" id="portal-guardian-self">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="portal-myself-heading" className="text-lg font-semibold text-gray-900">
            {t('pages.portal.myself_heading')}
          </h3>
          <p className="text-gray-900">
            <span className="font-semibold">{guardian.name}</span>{' '}
            <span className="text-sm font-normal text-gray-500">
              ({t('pages.enrolment.enrol_myself')})
            </span>
          </p>
          {guardian.dateOfBirth ? (
            <p className="text-sm text-gray-500">
              {t('form.person.date_of_birth')}:{' '}
              {new Date(guardian.dateOfBirth).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-sm text-amber-700">{t('pages.portal.myself_dob_missing')}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onEnrol}>
          {t('pages.classes.enrol')}
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {enrolments.length === 0 ? (
          <p className="text-sm text-gray-500">{t('pages.portal.no_enrolments')}</p>
        ) : (
          <ul className="mt-1" aria-label={t('pages.portal.enrolments_for_self')}>
            {enrolments.map((enrolment) => (
              <EnrolmentRow
                key={enrolment.id}
                enrolment={enrolment}
                highlighted={enrolment.id === highlightedEngagementId}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface GuardianSetupRequiredCardProps {
  onCompleteProfile: () => void;
}

export function GuardianSetupRequiredCard({ onCompleteProfile }: GuardianSetupRequiredCardProps) {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="portal-myself-setup-heading"
      className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600"
    >
      <h3 id="portal-myself-setup-heading" className="text-lg font-semibold text-gray-900 mb-2">
        {t('pages.portal.myself_heading')}
      </h3>
      <p>{t('pages.portal.myself_setup_required')}</p>
      <Button variant="primary" className="mt-4" onClick={onCompleteProfile}>
        {t('pages.portal.myself_setup_cta')}
      </Button>
    </section>
  );
}

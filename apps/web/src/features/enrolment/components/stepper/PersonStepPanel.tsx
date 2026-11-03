import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { hasParentRole } from '@/lib/parentRoles';
import type { UserProfile } from '@/types/auth';
import { evaluateAgeEnrolment } from '../../lib/ageEnrolmentPolicy';
import type { EnrolmentContextValue } from '../../hooks/useEnrolmentContext';
import type { AgeOverrideState } from '../../hooks/useAgeOverride';
import { AgeOverridePanel } from '../AgeOverridePanel';

/**
 * The "who is enrolling" step: loading/error and status notices around the
 * student picker (passed as children).
 */
export function PersonStepPanel({
  enrolmentContext,
  user,
  classPreselected,
  enrolledKeysLoading,
  preselectedAlreadyEnrolled,
  reviewSubmitted,
  personAgeError,
  attemptedPersonDob,
  classAgeOverride,
  setClassAgeOverride,
  children,
}: {
  enrolmentContext: EnrolmentContextValue;
  user: UserProfile | null;
  classPreselected: boolean;
  enrolledKeysLoading: boolean;
  preselectedAlreadyEnrolled: boolean;
  reviewSubmitted: boolean;
  personAgeError: string | null;
  attemptedPersonDob: string | null;
  classAgeOverride: AgeOverrideState;
  setClassAgeOverride: Dispatch<SetStateAction<AgeOverrideState>>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      {enrolmentContext.isLoading && (
        <p role="status">{t('common.loading')}</p>
      )}
      {enrolmentContext.error && (
        <p role="alert" className="text-sm text-red-600">
          {enrolmentContext.error.message}
        </p>
      )}
      {!enrolmentContext.isLoading &&
        classPreselected &&
        enrolledKeysLoading && (
          <p role="status">{t('common.loading')}</p>
        )}
      {!enrolmentContext.isLoading && classPreselected && preselectedAlreadyEnrolled && (
        <div
          className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900 space-y-3"
          role="status"
        >
          <p>
            {enrolmentContext.mode === 'admin'
              ? t('pages.enrolment.already_enrolled_preselected_admin')
              : t('pages.enrolment.already_enrolled_preselected')}
          </p>
          {user && hasParentRole(user.role) && enrolmentContext.mode !== 'admin' && (
            <Button type="button" variant="primary" onClick={() => navigate('/dashboard/portal')}>
              {t('pages.portal.view_enrolment')}
            </Button>
          )}
          {enrolmentContext.mode === 'admin' && (
            <Button type="button" variant="primary" onClick={() => navigate('/classes')}>
              {t('pages.enrol_complete.browse_classes')}
            </Button>
          )}
        </div>
      )}
      {!enrolmentContext.isLoading && reviewSubmitted && (
        <div
          className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900 space-y-2"
          role="status"
        >
          <p className="font-semibold">{t('pages.enrolment.age_review_submitted_title')}</p>
          <p>{t('pages.enrolment.age_review_submitted_body')}</p>
          <Button type="button" variant="outline" onClick={() => navigate('/classes')}>
            {t('pages.enrol_complete.browse_classes')}
          </Button>
        </div>
      )}
      {!enrolmentContext.isLoading && !reviewSubmitted && !enrolmentContext.canSkipPersonStep && (
        <>
          {personAgeError && (
            <div
              className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 space-y-2"
              role="alert"
            >
              <p>{personAgeError}</p>
              {classPreselected && enrolmentContext.mode === 'admin' && attemptedPersonDob && (
                <AgeOverridePanel
                  showMismatchWarning={false}
                  studentAge={
                    evaluateAgeEnrolment({
                      dateOfBirth: attemptedPersonDob,
                      ageBand: enrolmentContext.constraints.ageBand,
                      seasonStartDate: enrolmentContext.constraints.seasonStartDate,
                      actor: 'admin',
                    }).studentAge
                  }
                  classAges={
                    evaluateAgeEnrolment({
                      dateOfBirth: attemptedPersonDob,
                      ageBand: enrolmentContext.constraints.ageBand,
                      seasonStartDate: enrolmentContext.constraints.seasonStartDate,
                      actor: 'admin',
                    }).classAges
                  }
                  confirmed={classAgeOverride.confirmed}
                  reason={classAgeOverride.reason}
                  onConfirmedChange={(confirmed) =>
                    setClassAgeOverride((prev) => ({ ...prev, confirmed }))
                  }
                  onReasonChange={(reason) =>
                    setClassAgeOverride((prev) => ({ ...prev, reason }))
                  }
                />
              )}
            </div>
          )}
          {children}
        </>
      )}
    </>
  );
}

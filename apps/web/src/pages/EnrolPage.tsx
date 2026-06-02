import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EnrolmentStepper } from '@/features/enrolment/components';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import {
  persistEnrollmentIntent,
  readEnrollmentIntent,
  type EnrollmentIntent,
} from '@/lib/enrollment-intent';

export default function EnrolPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useCurrentUser();
  const intent = readEnrollmentIntent(location.state as EnrollmentIntent | null);
  const classId = intent?.classId;
  const seasonId = intent?.seasonId;

  useEffect(() => {
    if (intent) {
      persistEnrollmentIntent(intent);
    }
  }, [intent]);

  if (isLoading) {
    return (
      <div className="p-8 text-center" role="status" aria-live="polite">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('pages.classes.enrol')}</h1>

      {!user && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('pages.enrolment.guest_sign_in_prompt')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate('/login', {
                state: {
                  from: '/enrol',
                  classId,
                  seasonId,
                  personId: intent?.personId,
                  mode: intent?.mode,
                },
              })
            }
          >
            {t('pages.enrolment.guest_sign_in_action')}
          </Button>
        </div>
      )}

      <EnrolmentStepper
        initialClassId={intent?.classId}
        initialTermId={intent?.seasonId}
        enrollmentIntent={intent}
        skipNotificationStep
        onCancel={() => navigate('/classes')}
        onSuccess={() => navigate('/classes')}
      />
    </div>
  );
}

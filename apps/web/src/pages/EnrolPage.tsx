import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EnrolmentStepper } from '@/features/enrolment/components';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
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
  const termId = intent?.termId;

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login', {
        replace: true,
        state: { from: '/enrol', classId, termId },
      });
    }
  }, [user, isLoading, navigate, classId, termId]);

  if (isLoading) {
    return (
      <div className="p-8 text-center" role="status" aria-live="polite">
        {t('common.loading')}
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('pages.classes.enrol')}</h1>
      <EnrolmentStepper
        initialClassId={intent?.classId}
        initialTermId={intent?.termId}
        onCancel={() => navigate('/classes')}
        onSuccess={() => navigate('/classes')}
      />
    </div>
  );
}

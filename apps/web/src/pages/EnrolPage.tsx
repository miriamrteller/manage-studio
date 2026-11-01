import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Engagement } from '@shared/schemas';
import { EnrolmentStepper } from '@/features/enrolment/components';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import queryClient from '@/lib/query-client';
import { hasParentRole } from '@/lib/parentRoles';
import { buildPortalHighlightState } from '@/lib/portalHighlight';
import {
  clearEnrollmentIntent,
  persistEnrollmentIntent,
  readEnrollmentIntent,
  type EnrollmentIntent,
} from '@/lib/enrollment-intent';
import {
  clearEnrolmentResume,
  loadEnrolmentResume,
  type EnrolmentResumeState,
} from '@/features/enrolment/lib/enrolmentResumeState';

export default function EnrolPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useCurrentUser();

  const handleEnrolmentSuccess = useCallback(
    async (enrolment: Engagement) => {
      // The enrolment is done: drop the stored intent so /dashboard stops sending the
      // parent back to /enrol.
      clearEnrollmentIntent();
      if (user && hasParentRole(user.role)) {
        await queryClient.invalidateQueries({ queryKey: ['parent-portal'] });
        navigate('/dashboard/portal', { state: buildPortalHighlightState(enrolment) });
        return;
      }
      navigate('/classes');
    },
    [navigate, user],
  );
  const [resumeState, setResumeState] = useState<EnrolmentResumeState | null>(null);
  const intent = readEnrollmentIntent(location.state as EnrollmentIntent | null);
  const resumeKey =
    location.state && typeof location.state === 'object' && 'resumeKey' in location.state
      ? (location.state as { resumeKey?: string }).resumeKey
      : undefined;
  useEffect(() => {
    // Store the intent so it survives a sign-in round trip, but not when /dashboard just
    // forwarded it here (it was already consumed; storing it again causes a redirect loop).
    if (intent && !intent.viaDashboardRedirect) {
      persistEnrollmentIntent(intent);
    }
  }, [intent]);

  useEffect(() => {
    if (!resumeKey) return;
    let active = true;
    void (async () => {
      const restored = await loadEnrolmentResume(resumeKey);
      if (!active || !restored) return;
      setResumeState(restored);
      await clearEnrolmentResume(resumeKey);
      sessionStorage.removeItem('enrolmentResumeKey');
    })();
    return () => {
      active = false;
    };
  }, [resumeKey]);

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

      <EnrolmentStepper
        initialClassId={intent?.classId}
        initialTermId={intent?.seasonId}
        enrollmentIntent={intent}
        initialResumeState={resumeState}
        skipNotificationStep
        onCancel={() => navigate('/classes')}
        onSuccess={handleEnrolmentSuccess}
      />
    </div>
  );
}

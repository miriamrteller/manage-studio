import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * DashboardRedirectPage: Smart redirect based on user role
 * 
 * After login, this page checks the user's role and redirects to the most
 * appropriate authenticated page:
 * - If coming from /classes enrollment → return to /classes
 * - tenant_admin → /admin/setup
 * - parent/guardian → /dashboard/portal
 * - student/adult_student → /dashboard/student
 * - No matching role → /classes (fallback)
 * 
 * This ensures all authenticated users see the ProtectedNavigation with
 * their role-appropriate menu items.
 */
interface DashboardRedirectState {
  classId?: string;
}

function readEnrollmentClassId(
  routeState: DashboardRedirectState | null,
): string | undefined {
  if (routeState?.classId) {
    return routeState.classId;
  }

  const stored = sessionStorage.getItem('enrollmentIntent');
  if (!stored) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stored) as { classId?: string };
    return typeof parsed.classId === 'string' ? parsed.classId : undefined;
  } catch {
    return undefined;
  }
}

export default function DashboardRedirectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { user, isLoading: profileLoading } = useCurrentUser();
  const isLoading = sessionLoading || profileLoading;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    // Authenticated in Supabase Auth but no user_profiles row (403 / missing profile)
    if (session && !user) {
      return;
    }

    if (!session) {
      navigate('/login', { replace: true, state: location.state });
      return;
    }

    if (!user) {
      return;
    }

    const classId = readEnrollmentClassId(location.state as DashboardRedirectState | null);
    if (classId) {
      sessionStorage.removeItem('enrollmentIntent');
      navigate('/classes', { replace: true, state: { classId } });
      return;
    }

    // Determine redirect based on user role
    // Users can have multiple roles, so check in priority order
    if (user.role.includes('tenant_admin')) {
      navigate('/admin/setup', { replace: true });
    } else if (user.role.some((r) => ['parent', 'guardian'].includes(r))) {
      navigate('/dashboard/portal', { replace: true });
    } else if (user.role.some((r) => ['student', 'adult_student'].includes(r))) {
      navigate('/dashboard/student', { replace: true });
    } else {
      // No recognized role - fallback to classes
      navigate('/classes', { replace: true });
    }
  }, [session, user, isLoading, navigate, location.state]);

  if (!isLoading && session && !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div
          role="alert"
          className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center"
        >
          <h1 className="mb-2 text-xl font-semibold text-red-700">
            {t('errors.session_setup_failed')}
          </h1>
          <p className="text-red-600">{t('errors.user_not_found')}</p>
        </div>
      </div>
    );
  }

  // Show nothing while redirecting
  return null;
}

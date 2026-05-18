import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
export default function DashboardRedirectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useCurrentUser();

  useEffect(() => {
    // Still loading user data
    if (isLoading) {
      return;
    }

    // User not authenticated - shouldn't reach here, but fallback to login
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Check if user was enrolling on /classes - return to complete enrollment
    const fromEnrollment = (location.state as any)?.classId;
    if (fromEnrollment) {
      navigate('/classes', { replace: true });
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
  }, [user, isLoading, navigate, location.state]);

  // Show nothing while redirecting
  return null;
}

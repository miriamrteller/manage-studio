import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * Loading state component used by all route guards
 * Shows accessible loading indicator with proper ARIA attributes
 */
function LoadingState() {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
    >
      <p>{t('common.loading')}</p>
    </div>
  );
}

/**
 * AdminRoute: requires role to include 'tenant_admin'
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user || !user.role.includes('tenant_admin')) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * TeacherRoute: requires role to include 'teacher'
 */
export function TeacherRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user || !user.role.includes('teacher')) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * ParentRoute: requires role to include 'parent' or 'guardian'
 */
export function ParentRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingState />;
  }

  const hasParentRole = user?.role.some((r) =>
    ['parent', 'guardian'].includes(r)
  );

  if (!user || !hasParentRole) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * StudentRoute: requires role to include 'student' or 'adult_student'
 */
export function StudentRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingState />;
  }

  const hasStudentRole = user?.role.some((r) =>
    ['student', 'adult_student'].includes(r)
  );

  if (!user || !hasStudentRole) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

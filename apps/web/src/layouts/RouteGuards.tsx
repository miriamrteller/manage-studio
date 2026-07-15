import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { hasParentRole } from '@/lib/parentRoles';

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

/** Path + search so OAuth callbacks (and similar) survive a login redirect. */
function returnToFromLocation(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname}${location.search}`;
}

/**
 * AdminRoute: requires role to include 'tenant_admin'
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user || !user.role.includes('tenant_admin')) {
    return <Navigate to="/login" state={{ from: returnToFromLocation(location) }} replace />;
  }

  return <>{children}</>;
}

/**
 * TeacherRoute: requires role to include 'teacher'
 */
export function TeacherRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user || !user.role.includes('teacher')) {
    return <Navigate to="/login" state={{ from: returnToFromLocation(location) }} replace />;
  }

  return <>{children}</>;
}

/**
 * ParentRoute: requires a parent portal role (parent, guardian, or account_holder)
 */
export function ParentRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user || !hasParentRole(user.role)) {
    return <Navigate to="/login" state={{ from: returnToFromLocation(location) }} replace />;
  }

  return <>{children}</>;
}

/**
 * SuperAdminRoute: requires role to include 'super_admin'
 */
export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user || !user.role.includes('super_admin')) {
    return <Navigate to="/login" state={{ from: returnToFromLocation(location) }} replace />;
  }

  return <>{children}</>;
}

/**
 * StudentRoute: requires role to include 'student' or 'adult_student'
 */
export function StudentRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState />;
  }

  const hasStudentRole = user?.role.some((r) =>
    ['student', 'adult_student'].includes(r)
  );

  if (!user || !hasStudentRole) {
    return <Navigate to="/login" state={{ from: returnToFromLocation(location) }} replace />;
  }

  return <>{children}</>;
}

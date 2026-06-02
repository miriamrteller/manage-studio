import { hasParentRole } from '@/lib/parentRoles';

export type EnrollmentIntent = {
  classId?: string;
  seasonId?: string;
  /** When launched from a family admin page — scope student list to this account */
  accountId?: string;
  /** Pre-selected student — skip Step 1 */
  personId?: string;
  /** Admin enrolment wizard */
  mode?: 'admin' | 'parent';
  from?: string;
};

function hasIntentPayload(intent: EnrollmentIntent): boolean {
  return Boolean(
    intent.classId ||
      intent.personId ||
      intent.mode ||
      intent.from?.startsWith('/admin'),
  );
}

export function readEnrollmentIntent(
  routeState: EnrollmentIntent | null | undefined,
): EnrollmentIntent | null {
  if (routeState && hasIntentPayload(routeState)) {
    return routeState;
  }

  const stored = sessionStorage.getItem('enrollmentIntent');
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as EnrollmentIntent;
    return hasIntentPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistEnrollmentIntent(intent: EnrollmentIntent) {
  if (hasIntentPayload(intent)) {
    sessionStorage.setItem('enrollmentIntent', JSON.stringify(intent));
  }
}

export function clearEnrollmentIntent() {
  sessionStorage.removeItem('enrollmentIntent');
}

export function isAdminEnrolmentMode(
  intent: EnrollmentIntent | null | undefined,
  user?: { role: string[] } | null,
): boolean {
  if (intent?.mode === 'parent') return false;
  if (intent?.mode === 'admin') return true;
  if (user?.role.includes('tenant_admin')) {
    if (intent?.from?.startsWith('/admin')) return true;
    // Studio staff without a linked family account use admin intake (student + guardian).
    if (!hasParentRole(user.role)) return true;
  }
  return false;
}

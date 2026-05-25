export type EnrollmentIntent = {
  classId?: string;
  termId?: string;
  from?: string;
};

export function readEnrollmentIntent(
  routeState: EnrollmentIntent | null | undefined,
): EnrollmentIntent | null {
  if (routeState?.classId) {
    return routeState;
  }

  const stored = sessionStorage.getItem('enrollmentIntent');
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as EnrollmentIntent;
    return typeof parsed.classId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function persistEnrollmentIntent(intent: EnrollmentIntent) {
  if (intent.classId) {
    sessionStorage.setItem('enrollmentIntent', JSON.stringify(intent));
  }
}

export function clearEnrollmentIntent() {
  sessionStorage.removeItem('enrollmentIntent');
}

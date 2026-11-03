import { isSelfServeSignupEnabled, SELF_SERVE_PATH } from '@/features/self-serve/selfServeSignup';
import { tenantOrigin } from '@/lib/tenantUrl';

/**
 * Where "Sign up" goes on app.opalswift.com, which has no studio to join:
 * the studio's own signup when self-serve is on, otherwise OpalSwift HQ's
 * enquiry form (hq.<root domain>/inquire).
 */
export function platformSignupUrl(): string {
  return isSelfServeSignupEnabled() ? SELF_SERVE_PATH : `${tenantOrigin('hq')}/inquire?src=app`;
}

/**
 * Pages that only work for one studio (its classes, booking, enrolment, forms).
 * On the platform host they show a notice instead of waiting for a studio.
 */
export function isStudioOnlyPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (
    p === '/classes' ||
    p === '/enrol' ||
    p === '/inquire' ||
    p === '/book' ||
    p.startsWith('/book/') ||
    p.startsWith('/f/')
  );
}

/** Opens the platform signup destination (an absolute URL leaves the app). */
export function goToPlatformSignup(navigate: (to: string, opts?: { replace?: boolean }) => void, replace = false): void {
  const url = platformSignupUrl();
  if (/^https?:\/\//.test(url)) {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
  } else {
    navigate(url, { replace });
  }
}

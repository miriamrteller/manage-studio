import { useEffect, useRef } from 'react';
import { useAuthSession } from '@/hooks/useAuth';
import queryClient from '@/lib/query-client';
import router from '@/router';
import {
  LAST_ACTIVITY_KEY,
  SIGNED_OUT_KEY,
  isInactive,
  readLastActivity,
  recordActivity,
} from '@/lib/inactivity/activityStore';
import {
  ACTIVITY_THROTTLE_MS,
  INACTIVITY_LIMIT_MS,
  INACTIVITY_LOGIN_PATH,
  MAX_SIGN_OUT_DEFERRAL_MS,
  isInactivitySignOutEnabled,
} from '@/lib/inactivity/config';
import { signOutForInactivity } from '@/lib/inactivity/signOutForInactivity';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
const RECHECK_WHILE_SAVING_MS = 15_000;

/**
 * Signs the user out after INACTIVITY_LIMIT_MINUTES without input. Renders nothing, and does
 * nothing at all unless someone is signed in, so public pages (enquiry form, guest enrolment)
 * are unaffected.
 *
 * Activity = pointer, key, touch, scroll, or the tab becoming visible again, written to
 * localStorage (throttled) so every tab of this browser shares it. The check re-reads that
 * shared time, so activity in any tab keeps all of them signed in. The check for a browser
 * reopened after a long break runs before the first render (enforceInactivityOnLoad); this
 * component covers the tab that stays open, including a tab that was in the background.
 */
export function InactivityGuard() {
  const { session } = useAuthSession();
  const signedIn = Boolean(session);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!signedIn || !isInactivitySignOutEnabled()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let deferredSince: number | null = null;
    let cancelled = false;

    const goToLogin = () => {
      void router.navigate(INACTIVITY_LOGIN_PATH, { replace: true });
    };

    const expire = async () => {
      if (cancelled) return;
      // Never cut off a save in flight: wait for it, but not for ever.
      if (queryClient.isMutating() > 0) {
        const now = Date.now();
        deferredSince ??= now;
        if (now - deferredSince < MAX_SIGN_OUT_DEFERRAL_MS) {
          timer = setTimeout(check, RECHECK_WHILE_SAVING_MS);
          return;
        }
      }
      deferredSince = null;
      await signOutForInactivity();
      goToLogin();
    };

    function schedule() {
      clearTimeout(timer);
      const last = readLastActivity() ?? Date.now();
      const remaining = Math.max(1000, last + INACTIVITY_LIMIT_MS + 1 - Date.now());
      timer = setTimeout(check, remaining);
    }

    function check() {
      if (cancelled) return;
      if (isInactive(Date.now(), readLastActivity())) void expire();
      else schedule();
    }

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return;
      lastWriteRef.current = now;
      recordActivity(now);
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Coming back after a long time away is NOT activity: sign out first.
      if (isInactive(Date.now(), readLastActivity())) {
        void expire();
        return;
      }
      lastWriteRef.current = 0;
      onActivity();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY) schedule();
      // Another tab signed the user out for inactivity: show the same notice here.
      if (e.key === SIGNED_OUT_KEY && e.newValue) goToLogin();
    };

    // A session with no recorded time yet (first load after this feature, or a handoff from
    // another site address) starts its hour now.
    if (readLastActivity() === null) recordActivity(Date.now());
    schedule();

    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, [signedIn]);

  return null;
}

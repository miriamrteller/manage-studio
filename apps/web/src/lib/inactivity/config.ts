/**
 * Automatic sign-out after a period without activity, for every signed-in user
 * (super admin, studio admins, parents) on every host. The Supabase project is on
 * the Free plan, which has no server-side inactivity timeout, so the web app enforces it.
 *
 * This is the ONE place to change the length. The login notice reads it too.
 */
export const INACTIVITY_LIMIT_MINUTES = 60;

export const INACTIVITY_LIMIT_MS = INACTIVITY_LIMIT_MINUTES * 60 * 1000;

/** How often (at most) activity is written to storage; keeps scrolling and mouse moves cheap. */
export const ACTIVITY_THROTTLE_MS = 15_000;

/** While a save is in flight the sign-out waits, but never longer than this in total. */
export const MAX_SIGN_OUT_DEFERRAL_MS = 5 * 60 * 1000;

/** Query string on /login that makes it show the "signed out after inactivity" notice. */
export const INACTIVITY_LOGIN_REASON = 'inactivity';

export const INACTIVITY_LOGIN_PATH = `/login?reason=${INACTIVITY_LOGIN_REASON}`;

let enabled = true;

/**
 * The demo build has no real sign-in, so its entry point (demo/main.tsx) turns the automatic
 * sign-out off before rendering. Everything else keeps it on.
 */
export function setInactivitySignOutEnabled(value: boolean): void {
  enabled = value;
}

export function isInactivitySignOutEnabled(): boolean {
  return enabled;
}

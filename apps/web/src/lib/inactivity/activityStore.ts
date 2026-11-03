import { INACTIVITY_LIMIT_MS } from './config';

/**
 * The time of the last user activity, kept in localStorage so every tab of this browser
 * (on this site address) shares it. All access is wrapped: storage can be blocked or full.
 */
export const LAST_ACTIVITY_KEY = 'opalswift:last-activity';

/** Written when a tab signs the user out for inactivity, so the other tabs show the notice too. */
export const SIGNED_OUT_KEY = 'opalswift:inactivity-signed-out';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLastActivity(): number | null {
  try {
    const raw = store()?.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function recordActivity(now: number = Date.now()): void {
  try {
    store()?.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // Storage unavailable: the in-memory timer in the guard still works for this tab.
  }
}

export function clearLastActivity(): void {
  try {
    store()?.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

export function markSignedOutForInactivity(now: number = Date.now()): void {
  try {
    store()?.setItem(SIGNED_OUT_KEY, String(now));
  } catch {
    // ignore
  }
}

/** True when more than the limit has passed since `last`. A missing time is never "inactive". */
export function isInactive(now: number, last: number | null, limitMs: number = INACTIVITY_LIMIT_MS): boolean {
  return last !== null && now - last > limitMs;
}

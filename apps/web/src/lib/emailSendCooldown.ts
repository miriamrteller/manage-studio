import { useEffect, useState } from 'react';

/**
 * A short wait between sign-in emails to the same address. Each new link or
 * code replaces the previous one (Supabase keeps only the latest), and Supabase
 * refuses quick repeats (429 over_email_send_rate_limit). So after a send, the
 * button waits, and says why. Kept per email across reloads (localStorage).
 */
export const EMAIL_SEND_COOLDOWN_SECONDS = 60;

export type CooldownReason = 'sent' | 'rate_limited';

interface StoredCooldown {
  until: number;
  reason: CooldownReason;
}

const KEY_PREFIX = 'auth-email-cooldown:';
const COOLDOWN_EVENT = 'auth-email-cooldown';
/** In-page fallback when localStorage is unavailable. */
const memory = new Map<string, StoredCooldown>();
const LAST_EMAIL_KEY = 'auth-email-cooldown:last';

function keyFor(email: string): string {
  return KEY_PREFIX + email.trim().toLowerCase();
}

/** The stored wait; undefined when storage can't be read (use the in-page copy). */
function readStored(email: string): StoredCooldown | null | undefined {
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCooldown;
    return typeof parsed?.until === 'number' ? parsed : null;
  } catch {
    return undefined;
  }
}

function read(email: string): StoredCooldown | null {
  if (!email.trim()) return null;
  const stored = readStored(email);
  return stored === undefined ? memory.get(keyFor(email)) ?? null : stored;
}

/** Start (or extend) the wait for this email. */
export function startEmailCooldown(
  email: string,
  reason: CooldownReason,
  seconds: number = EMAIL_SEND_COOLDOWN_SECONDS,
  now: number = Date.now(),
): void {
  if (!email.trim()) return;
  const until = now + Math.max(1, Math.round(seconds)) * 1000;
  const existing = read(email);
  const value: StoredCooldown = { until: Math.max(until, existing?.until ?? 0), reason };
  try {
    window.localStorage.setItem(keyFor(email), JSON.stringify(value));
    window.localStorage.setItem(LAST_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    // Storage blocked (private window): the wait still applies on this page.
  }
  memory.set(keyFor(email), value);
  // Let any countdown on the page update at once (not on its next tick).
  try {
    window.dispatchEvent(new Event(COOLDOWN_EVENT));
  } catch {
    // no window (tests without DOM)
  }
}

/** Seconds left before another email may be sent to this address (0 = now). */
export function emailCooldownRemaining(email: string, now: number = Date.now()): { seconds: number; reason: CooldownReason | null } {
  const stored = read(email);
  if (!stored) return { seconds: 0, reason: null };
  const seconds = Math.max(0, Math.ceil((stored.until - now) / 1000));
  return { seconds, reason: seconds > 0 ? stored.reason : null };
}

/** The address a sign-in email was last sent to on this device, if any. */
export function lastEmailSentTo(): string | null {
  try {
    return window.localStorage.getItem(LAST_EMAIL_KEY);
  } catch {
    return null;
  }
}

/**
 * Seconds Supabase asks us to wait, from its 429 message
 * ("For security purposes, you can only request this after 45 seconds.").
 */
export function rateLimitWaitSeconds(message: string | undefined | null): number {
  const match = /after\s+(\d+)\s+second/i.exec(message ?? '');
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : EMAIL_SEND_COOLDOWN_SECONDS;
}

/** "0:45" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Live wait for an email, ticking once a second while it lasts. */
export function useEmailCooldown(email: string): { seconds: number; reason: CooldownReason | null } {
  const [state, setState] = useState(() => emailCooldownRemaining(email));
  useEffect(() => {
    setState(emailCooldownRemaining(email));
    const refresh = () => setState(emailCooldownRemaining(email));
    const id = window.setInterval(refresh, 1000);
    window.addEventListener(COOLDOWN_EVENT, refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(COOLDOWN_EVENT, refresh);
    };
  }, [email]);
  return state;
}

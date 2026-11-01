/**
 * Privacy scrubbing for error reports, run on every event before it leaves the
 * browser. It sits on top of the SDK's own `dataCollection: off` settings and
 * Sentry's server-side scrubbing.
 *
 * What we send: stack traces, the route *template*, release, browser, and opaque
 * ids (user UUID, tenant UUID). What we never send: names, emails, phones,
 * request/response bodies, cookies, query strings, URL hashes (Supabase puts
 * access tokens there on /auth/callback), or secret path tokens (/pay/:token,
 * /quote/:token, waiver links).
 */
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

/** Path segments whose next segment is always a secret token. */
const TOKEN_PARENTS = new Set(['pay', 'quote']);

/** A static route segment: short lowercase words, e.g. "admin", "bundled-payments". */
const STATIC_SEGMENT = /^(?:[a-z][a-z-]{0,39}|v\d{1,2})$/;

/** Turns a path into a route template: "/pay/abc123" → "/pay/:token", "/admin/jobs/<uuid>" → "/admin/jobs/:id". */
export function scrubPath(path: string): string {
  const parts = path.split('/');
  return parts
    .map((seg, i) => {
      if (seg === '') return seg;
      if (i > 0 && TOKEN_PARENTS.has(parts[i - 1])) return ':token';
      return STATIC_SEGMENT.test(seg) ? seg : ':id';
    })
    .join('/');
}

/** Keeps origin + route template; drops query string, hash and credentials. */
export function scrubUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const u = new URL(raw, base);
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    const path = scrubPath(u.pathname);
    return isAbsolute ? `${u.protocol}//${u.host}${path}` : path;
  } catch {
    return scrubText(raw.split(/[?#]/)[0]);
  }
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Israeli and international phone numbers (7+ digits with optional separators).
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/g;
// Postgres "Key (email)=(x@y.com)" detail lines can carry any column value.
const PG_KEY_DETAIL = /Key \(([^)]*)\)=\([^)]*\)/g;

/** Redacts emails, phones, JWTs, Postgres key details, and query strings inside URLs. */
export function scrubText(text: string): string {
  if (!text) return text;
  return text
    .replace(URL_IN_TEXT, (m) => scrubUrl(m))
    .replace(JWT, '[jwt]')
    .replace(EMAIL, '[email]')
    .replace(PG_KEY_DETAIL, 'Key ($1)=([redacted])')
    .replace(PHONE, '[number]');
}

/** Only these breadcrumb kinds are kept; console and DOM-click breadcrumbs can carry user text. */
const KEPT_BREADCRUMBS = new Set(['navigation', 'fetch', 'xhr']);

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  if (!b.category || !KEPT_BREADCRUMBS.has(b.category)) return null;
  const data: Record<string, unknown> = {};
  if (b.data) {
    for (const key of ['from', 'to', 'url']) {
      if (typeof b.data[key] === 'string') data[key] = scrubUrl(b.data[key] as string);
    }
    for (const key of ['method', 'status_code']) {
      if (b.data[key] !== undefined) data[key] = b.data[key];
    }
  }
  return { ...b, message: b.message ? scrubText(b.message) : b.message, data };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // Only the opaque user id survives; no email, name or IP.
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;

  if (event.request) {
    event.request = { url: event.request.url ? scrubUrl(event.request.url) : undefined };
  }
  if (event.transaction) event.transaction = scrubPath(event.transaction);
  if (event.message) event.message = scrubText(event.message);

  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
    for (const frame of ex.stacktrace?.frames ?? []) {
      // Local variables are never collected in the browser, but drop them defensively.
      delete frame.vars;
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }

  // Free-form extras and contexts we didn't set ourselves are dropped.
  delete event.extra;
  if (event.contexts) {
    const { browser, os, device, culture, react, feedback } = event.contexts;
    event.contexts = { browser, os, device, culture, react, feedback };
    if (feedback && typeof feedback.message === 'string') {
      feedback.message = scrubText(feedback.message);
    }
    if (feedback) {
      delete feedback.contact_email;
      delete feedback.name;
      if (typeof feedback.url === 'string') feedback.url = scrubUrl(feedback.url);
    }
  }
  return event;
}

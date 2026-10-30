/**
 * App-relative links the server hands back for the client's next booking
 * step (accept-quote, job-next-step). Only the two known shapes are followed,
 * so a bad response can never send the client off-site.
 */
const SIGN_PATH = /^\/enrol\/complete\?engagementId=[\w%-]+&wt=[\w%.-]+$/;
const PAY_PATH = /^\/pay\/[0-9a-fA-F]{16,128}$/;
const PORTAL_PATH = /^\/dashboard\/portal$/;

export function safeSignPath(path: unknown): string | null {
  return typeof path === 'string' && SIGN_PATH.test(path) ? path : null;
}

export function safePayPath(path: unknown): string | null {
  return typeof path === 'string' && PAY_PATH.test(path) ? path : null;
}

export function safePortalPath(path: unknown): string | null {
  return typeof path === 'string' && PORTAL_PATH.test(path) ? path : null;
}

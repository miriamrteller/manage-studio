/**
 * Error monitoring (Sentry, EU region). Everything here is a no-op unless
 * VITE_SENTRY_DSN is set at build time, so local dev, CI, the demo build and any
 * deploy without the variable behave exactly as before.
 *
 * The SDK is loaded with a dynamic import only when a DSN exists, so builds
 * without one ship none of it. Calls made before the SDK finishes loading are
 * queued. See docs/deployment/OBSERVABILITY.md.
 */
import type * as SentryNS from './sdk';
import { scrubBreadcrumb, scrubEvent } from './scrub';

type Sentry = typeof SentryNS;

let sentry: Sentry | null = null;
let loading: Promise<Sentry | null> | null = null;
const pending: Array<(s: Sentry) => void> = [];

function configuredDsn(): string | null {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn || !dsn.startsWith('https://')) return null;
  return dsn;
}

/** True when this build reports errors (a DSN is configured). */
export function isMonitoringEnabled(): boolean {
  return configuredDsn() !== null;
}

function environment(): string {
  const explicit = import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined;
  if (explicit) return explicit;
  if (import.meta.env.DEV) return 'development';
  const root = import.meta.env.VITE_APP_ROOT_DOMAIN as string | undefined;
  return root && window.location.hostname.endsWith(root) ? 'production' : 'preview';
}

function run(fn: (s: Sentry) => void): void {
  if (sentry) fn(sentry);
  else if (loading) pending.push(fn);
}

export function initMonitoring(): Promise<Sentry | null> {
  const dsn = configuredDsn();
  if (!dsn) return Promise.resolve(null);
  if (loading) return loading;

  loading = import('./sdk')
    .then((S) => {
      S.init({
        dsn,
        release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
        environment: environment(),
        // Collect nothing about the person or the HTTP traffic beyond what we set ourselves.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        // Errors only: no performance tracing, no session replay, no screenshots.
        tracesSampleRate: 0,
        maxBreadcrumbs: 30,
        integrations: (defaults) =>
          defaults
            .filter((i) => i.name !== 'Breadcrumbs')
            .concat(S.breadcrumbsIntegration({ dom: false, sentry: false })),
        ignoreErrors: [
          // Browser noise that is not actionable.
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          /Loading chunk \d+ failed/,
          /Failed to fetch dynamically imported module/,
        ],
        beforeBreadcrumb: (b) => scrubBreadcrumb(b),
        beforeSend: (event) => scrubEvent(event),
      });
      sentry = S;
      for (const fn of pending.splice(0)) fn(S);
      return S;
    })
    .catch((err) => {
      console.warn('[monitoring] failed to load error reporting', err);
      pending.length = 0;
      return null;
    });
  return loading;
}

export type MonitoringContext = {
  tenantId?: string | null;
  userId?: string | null;
  /** Highest role, e.g. "admin" or "parent". Never a name or email. */
  role?: string | null;
};

/** Tags every later report with the studio and the opaque user id. */
export function setMonitoringContext(ctx: MonitoringContext): void {
  run((S) => {
    S.setTag('tenant_id', ctx.tenantId ?? 'none');
    S.setTag('role', ctx.role ?? 'anonymous');
    S.setUser(ctx.userId ? { id: ctx.userId } : null);
  });
}

/** Tags reports with the current route template (already scrubbed of ids/tokens). */
export function setMonitoringRoute(routeTemplate: string): void {
  run((S) => S.setTag('route', routeTemplate));
}

/**
 * Supabase/PostgREST errors are plain objects ({ message, code, details, hint }).
 * Turn them into a real Error carrying only message + code: `details` can hold row values.
 */
export function toReportable(error: unknown): { error: Error; code?: string } {
  if (error instanceof Error) return { error };
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    const { message, code } = error as { message: string; code?: unknown };
    const e = new Error(message);
    e.name = 'SupabaseError';
    return { error: e, code: typeof code === 'string' ? code : undefined };
  }
  return { error: new Error(typeof error === 'string' ? error : 'Non-error value thrown') };
}

/** Reports an error caught by our own code (error boundaries, query failures, critical catch blocks). */
export function reportError(error: unknown, tags?: Record<string, string>): void {
  run((S) => {
    const { error: e, code } = toReportable(error);
    S.withScope((scope) => {
      if (tags) scope.setTags(tags);
      if (code) scope.setTag('db_code', code);
      S.captureException(e);
    });
  });
}

/** Id of the last reported error, used to link a problem report to it. */
export function lastErrorId(): string | undefined {
  return sentry?.lastEventId();
}

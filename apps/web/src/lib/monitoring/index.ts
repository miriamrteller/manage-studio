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
import { resolveTenantSite } from '../resolveTenantSubdomain';
import type { ErrorEvent } from '@sentry/react';
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from './scrub';

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
  if (root && window.location.hostname.endsWith(root)) return 'production';
  // A studio's custom domain (e.g. app.creativeballetacademy.com) is production too.
  return resolveTenantSite()?.kind === 'custom' ? 'production' : 'preview';
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
        // Errors only: no performance tracing, no session replay, no automatic screenshots.
        // The only image that ever leaves is one an admin picks themselves in "Report a problem".
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
      // beforeSend only sees error events; problem reports (feedback events) get the same scrubbing here.
      S.addEventProcessor((event) =>
        event.type === 'feedback' ? (scrubEvent(event as unknown as ErrorEvent) as unknown as typeof event) : event,
      );
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

/** Roles that see "Report a problem". Clients and students do not. */
const REPORTER_ROLES = ['tenant_admin', 'super_admin'];

export function canReportProblems(roles: string[] | undefined): boolean {
  return isMonitoringEnabled() && !!roles?.some((r) => REPORTER_ROLES.includes(r));
}

/** Largest screenshot an admin can attach to a problem report. */
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type ScreenshotType = (typeof SCREENSHOT_TYPES)[number];

const SCREENSHOT_NAMES: Record<ScreenshotType, string> = {
  'image/png': 'screenshot.png',
  'image/jpeg': 'screenshot.jpg',
  'image/webp': 'screenshot.webp',
};

export type ScreenshotProblem = 'type' | 'size' | 'read';

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/** True when the first bytes really are the image format the file claims to be. */
function matchesSignature(type: ScreenshotType, b: Uint8Array): boolean {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (type === 'image/png') return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (type === 'image/jpeg') return at(0, 0xff, 0xd8, 0xff);
  return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50); // RIFF....WEBP
}

/**
 * Checks a screenshot the admin picked: PNG, JPG or WebP, at most 5 MB, and the content
 * must match the type (a renamed document is refused). Returns null when it is fine.
 */
export async function checkScreenshot(file: File): Promise<ScreenshotProblem | null> {
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > SCREENSHOT_MAX_BYTES) return 'size';
  try {
    const head = await readBytes(file.slice(0, 12));
    return matchesSignature(file.type as ScreenshotType, head) ? null : 'type';
  } catch {
    return 'read';
  }
}

/**
 * Sends a problem report typed by a studio admin. Only the (scrubbed) text, the
 * page's route template and the current tags go out, plus one image if the admin chose
 * to attach it (see checkScreenshot). Nothing is captured automatically, and the picked
 * file's own name is never sent: it is renamed to a generic one, because file names can
 * carry people's names. Links the report to the last error on this page when there was one.
 */
export async function sendProblemReport(message: string, screenshot?: File | null): Promise<string | null> {
  const text = scrubText(message.trim()).slice(0, 2000);
  if (!text) return null;
  const S = sentry ?? (await initMonitoring());
  if (!S) return null;

  let attachments: Array<{ filename: string; data: Uint8Array; contentType: string }> | undefined;
  if (screenshot) {
    // Re-check here as well, so nothing but a valid image can go out through this function.
    if ((await checkScreenshot(screenshot)) !== null) return null;
    attachments = [
      {
        filename: SCREENSHOT_NAMES[screenshot.type as ScreenshotType],
        data: await readBytes(screenshot),
        contentType: screenshot.type,
      },
    ];
  }

  return S.captureFeedback(
    {
      message: text,
      url: scrubUrl(window.location.href),
      source: 'report-problem',
      associatedEventId: S.lastEventId(),
    },
    attachments ? { attachments } : undefined,
  );
}

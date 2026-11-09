/**
 * After a release, a page opened before it still asks for the old build's files, which no longer
 * exist ("Failed to fetch dynamically imported module"). Reloading picks up the new build. We
 * reload at most once a minute, so a real outage can't loop.
 */
const KEY = 'opalswift:stale-build-reload-at';
const MIN_GAP_MS = 60_000;

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(
    message,
  );
}

/** Reloads the page once for a stale-build error. Returns true when a reload was started. */
export function reloadForStaleBuild(
  error: unknown,
  { now = Date.now(), storage = safeSession(), reload = () => window.location.reload() } = {},
): boolean {
  if (!isStaleBuildError(error)) return false;
  try {
    const last = Number(storage?.getItem(KEY) ?? 0);
    if (last && now - last < MIN_GAP_MS) return false;
    storage?.setItem(KEY, String(now));
  } catch {
    // No storage: still reload once; the error page shows if it happens again.
  }
  reload();
  return true;
}

function safeSession(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Vite fires this when a lazy page's file can't be loaded. */
export function installStaleBuildReload(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (reloadForStaleBuild(payload)) event.preventDefault();
  });
}

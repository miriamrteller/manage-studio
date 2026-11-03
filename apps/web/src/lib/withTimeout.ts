/**
 * Resolves with the promise's result, or with `fallback` once `ms` have passed, whichever
 * comes first. Never rejects because of the timer. Used so a network call that never answers
 * (a stuck session refresh, a dropped connection) cannot leave a page on "Loading..." forever.
 * A late result is ignored by the caller that already moved on.
 */
export function withTimeout<T, F>(promise: PromiseLike<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise<T | F>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** How long start-up and page-level auth waits may take before we stop waiting. */
export const AUTH_WAIT_MS = 6_000;

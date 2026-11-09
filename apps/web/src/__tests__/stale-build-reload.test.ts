/** A page opened before a release reloads itself once instead of showing the error page. */
import { describe, it, expect, vi } from 'vitest';
import { isStaleBuildError, reloadForStaleBuild } from '../lib/staleBuildReload';

function memory(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } as Storage;
}
const stale = new TypeError('Failed to fetch dynamically imported module: https://x/assets/LoginPage-D8TWXEaQ.js');

describe('stale build reload', () => {
  it('knows the stale-build errors from Chrome, Safari and Firefox', () => {
    expect(isStaleBuildError(stale)).toBe(true);
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleBuildError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('reloads once, then not again within a minute', () => {
    const storage = memory();
    const reload = vi.fn();
    expect(reloadForStaleBuild(stale, { now: 1_000_000, storage, reload })).toBe(true);
    expect(reloadForStaleBuild(stale, { now: 1_030_000, storage, reload })).toBe(false);
    expect(reloadForStaleBuild(stale, { now: 1_070_000, storage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('never reloads for other errors', () => {
    const reload = vi.fn();
    expect(reloadForStaleBuild(new Error('boom'), { storage: memory(), reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

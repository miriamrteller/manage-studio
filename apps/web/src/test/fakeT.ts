import type { TFunction } from 'i18next';

/** A `t` for tests: returns the key, or the key and its options when given. */
export function fakeT(impl: (key: string, opts?: Record<string, unknown>) => string = (key) => key): TFunction {
  return impl as unknown as TFunction;
}

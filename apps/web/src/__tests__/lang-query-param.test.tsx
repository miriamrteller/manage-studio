// @vitest-environment jsdom
/**
 * `?lang=he|en` on any page picks the visitor's language, is saved like the
 * toggle, and is dropped from the address. A saved profile language still wins.
 * Run: pnpm -C apps/web test lang-query-param.test.tsx
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { consumeLangParam, readLangParam, resolveEffectiveLanguage } from '@/lib/resolve-language';

describe('readLangParam', () => {
  it('reads a valid language and removes only that param', () => {
    expect(readLangParam('https://app.example.com/classes?lang=he')).toEqual({ lang: 'he', cleaned: '/classes' });
    expect(readLangParam('https://app.example.com/?a=1&lang=EN#top')).toEqual({ lang: 'en', cleaned: '/?a=1#top' });
  });

  it('ignores an unknown value but still drops it', () => {
    expect(readLangParam('https://app.example.com/classes?lang=fr')).toEqual({ lang: null, cleaned: '/classes' });
  });

  it('leaves addresses without the param alone', () => {
    expect(readLangParam('https://app.example.com/classes?x=1')).toEqual({ lang: null, cleaned: null });
  });
});

describe('with the link applied', () => {
  beforeEach(() => localStorage.clear());

  it('a guest gets the linked language, ahead of the studio default', () => {
    localStorage.setItem('language', 'he');
    expect(
      resolveEffectiveLanguage({ profileLanguage: null, tenantDefault: 'en', isAuthenticated: false, isProfileChecked: true }),
    ).toBe('he');
  });

  it('a signed-in user keeps their saved profile language', () => {
    localStorage.setItem('language', 'he');
    expect(
      resolveEffectiveLanguage({ profileLanguage: 'en', tenantDefault: 'en', isAuthenticated: true, isProfileChecked: true }),
    ).toBe('en');
  });
});

describe('consumeLangParam', () => {
  beforeEach(() => localStorage.clear());

  it('saves the language and drops the param from the address', () => {
    window.history.replaceState(null, '', '/classes?lang=he&x=1');
    expect(consumeLangParam()).toBe('he');
    expect(localStorage.getItem('language')).toBe('he');
    expect(window.location.pathname + window.location.search).toBe('/classes?x=1');
  });

  it('does nothing without the param', () => {
    window.history.replaceState(null, '', '/classes');
    expect(consumeLangParam()).toBeNull();
    expect(localStorage.getItem('language')).toBeNull();
  });
});

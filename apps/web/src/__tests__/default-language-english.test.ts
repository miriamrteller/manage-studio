// @vitest-environment jsdom
/**
 * The app opens in English: no browser-locale detection. Hebrew only when the
 * visitor chose it (saved), or the studio's own default language is Hebrew.
 * Run: pnpm -C apps/web test default-language-english.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveEffectiveLanguage, resolveLanguage } from '@/lib/resolve-language';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('he-IL');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['he-IL', 'he']);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const guest = { profileLanguage: null, isAuthenticated: false, isProfileChecked: true };

describe('default language', () => {
  it('Hebrew browser locale, no saved choice, no studio default → English', () => {
    expect(resolveEffectiveLanguage({ ...guest, tenantDefault: null })).toBe('en');
    expect(resolveLanguage(null, null)).toBe('en');
  });

  it('signed in while the profile is still loading, nothing saved → English', () => {
    expect(
      resolveEffectiveLanguage({ profileLanguage: null, tenantDefault: null, isAuthenticated: true, isProfileChecked: false }),
    ).toBe('en');
  });

  it('saved Hebrew choice → Hebrew', () => {
    localStorage.setItem('language', 'he');
    expect(resolveEffectiveLanguage({ ...guest, tenantDefault: 'en' })).toBe('he');
  });

  it("a profile's chosen language wins", () => {
    expect(resolveEffectiveLanguage({ ...guest, profileLanguage: 'he', tenantDefault: 'en' })).toBe('he');
  });

  it("the studio's default language is still honoured (unchanged)", () => {
    expect(resolveEffectiveLanguage({ ...guest, tenantDefault: 'he' })).toBe('he');
  });
});

import { describe, it, expect } from 'vitest';
import { resolveLegalLinks } from './legalLinks';
import { isValidLegalUrl } from '@/features/settings/components/LegalLinksSettingsForm';

describe('resolveLegalLinks', () => {
  it("prefers the studio's own links", () => {
    const links = resolveLegalLinks(
      { privacy_policy_url: 'https://studio.example/privacy', terms_url: 'https://studio.example/terms' },
      { VITE_PRIVACY_POLICY_URL: 'https://opalswift.example/privacy' },
    );
    expect(links).toEqual({
      privacy: 'https://studio.example/privacy',
      terms: 'https://studio.example/terms',
      accessibility: null,
    });
  });

  it('falls back to the platform links', () => {
    const links = resolveLegalLinks(null, {
      VITE_PRIVACY_POLICY_URL: 'https://opalswift.example/privacy',
      VITE_ACCESSIBILITY_STATEMENT_URL: 'https://opalswift.example/a11y',
    });
    expect(links.privacy).toBe('https://opalswift.example/privacy');
    expect(links.accessibility).toBe('https://opalswift.example/a11y');
    expect(links.terms).toBeNull();
  });

  it('ignores blank or non-URL values', () => {
    expect(resolveLegalLinks({ terms_url: '  ' }, { VITE_TERMS_URL: 'javascript:alert(1)' }).terms).toBeNull();
  });
});

describe('isValidLegalUrl', () => {
  it('accepts https or empty, rejects the rest', () => {
    expect(isValidLegalUrl('https://studio.example/privacy')).toBe(true);
    expect(isValidLegalUrl('')).toBe(true);
    expect(isValidLegalUrl('http://studio.example')).toBe(false);
    expect(isValidLegalUrl('studio.example')).toBe(false);
  });
});

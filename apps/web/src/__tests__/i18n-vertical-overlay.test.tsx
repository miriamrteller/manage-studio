// @vitest-environment jsdom
/**
 * Photographer wording overlay (src/i18n/verticals/photographer.*.json):
 *  - static shape: only keys that exist in the base files, en/he in step,
 *    no dance vocabulary, no interpolation the call sites don't pass;
 *  - runtime: only photographer tenants resolve the overlay; dance, generic,
 *    beautician and vertical-less tenants get the base wording unchanged.
 * Dance overlay (src/i18n/verticals/dance.*.json): the enrolment document is a
 * "health declaration" for dance only (docs/legal/07b); every other vertical
 * sees the neutral base "form", and nothing anywhere calls it a waiver.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useContext } from 'react';
import { I18nContext, useTranslation } from 'react-i18next';
import enBase from '@/i18n/en.json';
import heBase from '@/i18n/he.json';
import enOverlay from '@/i18n/verticals/photographer.en.json';
import heOverlay from '@/i18n/verticals/photographer.he.json';
import enDance from '@/i18n/verticals/dance.en.json';
import heDance from '@/i18n/verticals/dance.he.json';
import i18n from '@/i18n/i18n';
import { BASE_NAMESPACE, DANCE_NAMESPACE, PHOTOGRAPHER_NAMESPACE, overlayNamespaceFor } from '@/i18n/verticalNamespace';
import { renderInApp, setLanguage, setTenant, type FakeTenantKind } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

type Json = { [key: string]: Json | string };

/** Photographer studios have family accounts off, so they read the photographer overlay layered on the no-families one. */
const PHOTOGRAPHER_NO_FAMILIES = overlayNamespaceFor('photographer', { familyAccounts: false });

function flatten(obj: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

const base = { en: flatten(enBase as unknown as Json), he: flatten(heBase as unknown as Json) };
const overlay = { en: flatten(enOverlay as Json), he: flatten(heOverlay as Json) };

/** Visible wording only: interpolation variable names ({{classes}}) are code, not copy. */
const wording = (s: string) => s.replace(/\{\{[^}]*\}\}/g, '');

const placeholders = (s: string) => new Set([...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]));

describe('photographer overlay files', () => {
  it('has content', () => {
    expect(Object.keys(overlay.en).length).toBeGreaterThan(10);
  });

  it.each(['en', 'he'] as const)('every %s overlay key exists in the base file (no orphan keys)', (lng) => {
    const orphans = Object.keys(overlay[lng]).filter((k) => !(k in base[lng]));
    expect(orphans).toEqual([]);
  });

  it('en and he overlays define exactly the same keys', () => {
    expect(Object.keys(overlay.he).sort()).toEqual(Object.keys(overlay.en).sort());
  });

  it('only holds keys whose wording actually differs from the base', () => {
    for (const lng of ['en', 'he'] as const) {
      const same = Object.keys(overlay[lng]).filter((k) => overlay[lng][k] === base[lng][k]);
      expect(same, lng).toEqual([]);
    }
  });

  it('English overlay never mentions class / waiver / enrol / student', () => {
    const offenders = Object.entries(overlay.en).filter(([, v]) => /class|waiver|enrol|student/i.test(wording(v)));
    expect(offenders).toEqual([]);
  });

  it('Hebrew overlay never mentions שיעור / ויתור / הרשמה / תלמיד', () => {
    const offenders = Object.entries(overlay.he).filter(([, v]) => /שיעור|ויתור|הרשמה|תלמיד/.test(wording(v)));
    expect(offenders).toEqual([]);
  });

  it('uses no interpolation variables the base string does not already receive', () => {
    for (const lng of ['en', 'he'] as const) {
      for (const [k, v] of Object.entries(overlay[lng])) {
        const allowed = placeholders(base[lng][k]);
        for (const p of placeholders(v)) expect(allowed.has(p), `${lng}:${k} uses {{${p}}}`).toBe(true);
      }
    }
  });
});

describe('overlayNamespaceFor', () => {
  it('maps photographer and dance to their overlays and everything else to none', () => {
    expect(overlayNamespaceFor('photographer')).toBe(PHOTOGRAPHER_NAMESPACE);
    expect(overlayNamespaceFor('dance-studio')).toBe(DANCE_NAMESPACE);
    for (const v of ['generic', 'beautician', undefined, null] as const) {
      expect(overlayNamespaceFor(v)).toBeNull();
    }
  });

  it('i18next is configured with the base namespace as default and fallback', () => {
    expect(i18n.options.defaultNS).toBe(BASE_NAMESPACE);
    expect([i18n.options.fallbackNS].flat()).toEqual([BASE_NAMESPACE]);
    expect(i18n.hasResourceBundle('en', PHOTOGRAPHER_NAMESPACE)).toBe(true);
    expect(i18n.hasResourceBundle('he', PHOTOGRAPHER_NAMESPACE)).toBe(true);
  });
});

function Probe() {
  const { t } = useTranslation();
  const ctx = useContext(I18nContext) as { defaultNS?: string } | undefined;
  return (
    <div>
      <p data-testid="ns">{String(ctx?.defaultNS ?? BASE_NAMESPACE)}</p>
      <p data-testid="overridden">{t('pages.enrol_complete.signed_heading')}</p>
      <p data-testid="with-default">{t('enrolment.waiver_checkbox_label', { defaultValue: 'fallback text' })}</p>
      <p data-testid="not-in-overlay">{t('pages.enrol_complete.go_to_dashboard')}</p>
      <p data-testid="nested-not-in-overlay">{t('pages.portal.add_child')}</p>
    </div>
  );
}

describe('runtime resolution through LabelsProvider', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  it.each<FakeTenantKind | null>(['generic', 'none', 'beautician', null])(
    'tenant %s never resolves the photographer overlay',
    async (kind) => {
      setTenant(kind);
      for (const lng of ['en', 'he'] as const) {
        await setLanguage(lng);
        const { unmount } = renderInApp(<Probe />);
        expect(screen.getByTestId('ns').textContent).not.toBe(PHOTOGRAPHER_NAMESPACE);
        expect(screen.getByTestId('overridden').textContent).toBe(base[lng]['pages.enrol_complete.signed_heading']);
        expect(screen.getByTestId('with-default').textContent).toBe(base[lng]['enrolment.waiver_checkbox_label']);
        expect(screen.getByTestId('not-in-overlay').textContent).toBe(base[lng]['pages.enrol_complete.go_to_dashboard']);
        unmount();
      }
    },
  );

  it('photographer resolves the overlay first and falls back to the base wording', async () => {
    setTenant('photographer');
    for (const lng of ['en', 'he'] as const) {
      await setLanguage(lng);
      const { unmount } = renderInApp(<Probe />);
      expect(screen.getByTestId('ns').textContent).toBe(PHOTOGRAPHER_NO_FAMILIES);
      expect(screen.getByTestId('overridden').textContent).toBe(overlay[lng]['pages.enrol_complete.signed_heading']);
      expect(screen.getByTestId('with-default').textContent).toBe(overlay[lng]['enrolment.waiver_checkbox_label']);
      expect(screen.getByTestId('not-in-overlay').textContent).toBe(base[lng]['pages.enrol_complete.go_to_dashboard']);
      expect(screen.getByTestId('nested-not-in-overlay').textContent).toBe(base[lng]['pages.portal.add_child']);
      unmount();
    }
    expect(overlay.he['pages.enrol_complete.signed_heading']).toBe('החוזה נחתם — תודה!');
  });

  it('client search subtitle uses client wording for photographers only', async () => {
    const tPhoto = i18n.getFixedT('en', PHOTOGRAPHER_NAMESPACE);
    const tBase = i18n.getFixedT('en', BASE_NAMESPACE);
    expect(tPhoto('person_search.guardian', { name: 'Pat' })).toBe('Main contact: Pat');
    expect(tPhoto('person_search.enrolled_in', { classes: 'Wedding Gold' })).toBe('Packages: Wedding Gold');
    expect(tBase('person_search.guardian', { name: 'Pat' })).toBe('Parent: Pat');
    expect(tBase('person_search.enrolled_in', { classes: 'Ballet 1' })).toBe('Enrolled: Ballet 1');
  });

  it('a Hebrew photographer never gets English overlay text', async () => {
    setTenant('photographer');
    await setLanguage('he');
    for (const key of Object.keys(overlay.he)) {
      expect(i18n.getFixedT('he', PHOTOGRAPHER_NAMESPACE)(key)).toBe(overlay.he[key]);
    }
  });

  it('switches when the tenant loads after first render', async () => {
    setTenant(null);
    const view = renderInApp(<Probe />);
    expect(screen.getByTestId('overridden').textContent).toBe(base.en['pages.enrol_complete.signed_heading']);
    setTenant('photographer');
    view.rerenderApp();
    expect(await screen.findByText(overlay.en['pages.enrol_complete.signed_heading'])).toBeInTheDocument();
    expect(screen.getByTestId('ns').textContent).toBe(PHOTOGRAPHER_NO_FAMILIES);
  });
});

describe('dance overlay: health declaration for dance, neutral form for everyone else', () => {
  const danceFlat = { en: flatten(enDance as Json), he: flatten(heDance as Json) };

  it('holds only keys from the base files; Hebrew only where the wording names the document', () => {
    for (const key of Object.keys(danceFlat.he)) expect(danceFlat.en, key).toHaveProperty([key]);
    for (const lng of ['en', 'he'] as const) {
      for (const key of Object.keys(danceFlat[lng])) expect(base[lng], key).toHaveProperty([key]);
    }
  });

  it('en and he define the same keys, so Hebrew dance studios get the same wording', () => {
    expect(Object.keys(danceFlat.he).sort()).toEqual(Object.keys(danceFlat.en).sort());
  });

  it('never calls the document a waiver, in any vertical or language', () => {
    for (const lng of ['en', 'he'] as const) {
      for (const [key, value] of Object.entries(danceFlat[lng])) {
        expect(value, key).not.toMatch(/waiver|ויתור/i);
        expect(value, key).toMatch(/health declaration|הצהרת (ה)?בריאות/i);
      }
      for (const key of Object.keys(danceFlat.en)) {
        expect(base[lng][key], key).not.toMatch(/waiver|ויתור/i);
      }
    }
  });

  it('the admin template editor is neutral "Forms" for every vertical (not overridden for dance)', () => {
    expect(base.en['pages.waivers.title']).toBe('Forms');
    expect(base.he['pages.waivers.title']).toBe('טפסים');
    expect(base.en['nav.waivers']).toBe('Forms to sign');
    expect(danceFlat.en['pages.waivers.title']).toBeUndefined();
    expect(danceFlat.en['nav.waivers']).toBeUndefined();
  });

  it.each([
    ['dance', 'Health declaration signed — welcome!', 'I have read and accept this health declaration', 'הצהרת הבריאות נחתמה — ברוכים הבאים!'],
    ['generic', 'Form signed — welcome!', 'I have read and accept this form', 'הטופס נחתם — ברוכים הבאים!'],
    ['beautician', 'Form signed — welcome!', 'I have read and accept this form', 'הטופס נחתם — ברוכים הבאים!'],
    ['none', 'Form signed — welcome!', 'I have read and accept this form', 'הטופס נחתם — ברוכים הבאים!'],
  ] as const)('tenant %s sees its own wording at runtime', async (kind, heading, checkbox, heHeading) => {
    setTenant(kind);
    await setLanguage('en');
    let view = renderInApp(<Probe />);
    expect(screen.getByTestId('overridden').textContent).toBe(heading);
    expect(screen.getByTestId('with-default').textContent).toBe(checkbox);
    expect(screen.getByTestId('not-in-overlay').textContent).toBe(base.en['pages.enrol_complete.go_to_dashboard']);
    view.unmount();
    await setLanguage('he');
    view = renderInApp(<Probe />);
    expect(screen.getByTestId('overridden').textContent).toBe(heHeading);
    view.unmount();
  });
});

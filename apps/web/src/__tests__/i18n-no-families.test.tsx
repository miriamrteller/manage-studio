// @vitest-environment jsdom
/**
 * No-families wording (src/i18n/verticals/no-families.*.json): a studio with
 * family accounts switched off never reads "family" or "parents" in admin.
 * Studios with family accounts on (dance) keep the base wording.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import enBase from '@/i18n/en.json';
import heBase from '@/i18n/he.json';
import enNoFamilies from '@/i18n/verticals/no-families.en.json';
import heNoFamilies from '@/i18n/verticals/no-families.he.json';
import enPhotographer from '@/i18n/verticals/photographer.en.json';
import i18n from '@/i18n/i18n';
import { NO_FAMILIES_NAMESPACE, overlayNamespaceFor } from '@/i18n/verticalNamespace';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

type Json = { [key: string]: Json | string };

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const base = { en: flatten(enBase as Json), he: flatten(heBase as Json) };
const noFamilies = { en: flatten(enNoFamilies as Json), he: flatten(heNoFamilies as Json) };
const photographer = flatten(enPhotographer as Json);

function interpolations(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
}

describe('no-families overlay files', () => {
  it('has the same keys in en and he, all from the base files, with the same placeholders', () => {
    expect(Object.keys(noFamilies.he).sort()).toEqual(Object.keys(noFamilies.en).sort());
    for (const lng of ['en', 'he'] as const) {
      for (const [key, text] of Object.entries(noFamilies[lng])) {
        expect(base[lng], key).toHaveProperty([key]);
        expect(interpolations(text), key).toEqual(interpolations(base[lng][key]));
      }
    }
  });

  it('never mentions families, parents or children', () => {
    for (const text of Object.values(noFamilies.en)) expect(text).not.toMatch(/famil|parent|child|guardian/i);
    for (const text of Object.values(noFamilies.he)) expect(text).not.toMatch(/משפח|הורה|הורים|ילד|אפוטרופוס/);
  });
});

describe('overlayNamespaceFor with family accounts off', () => {
  it('adds the no-families wording to every vertical', () => {
    expect(overlayNamespaceFor('generic', { familyAccounts: false })).toBe(NO_FAMILIES_NAMESPACE);
    expect(overlayNamespaceFor(null, { familyAccounts: false })).toBe(NO_FAMILIES_NAMESPACE);
    for (const v of ['photographer', 'dance-studio'] as const) {
      const ns = overlayNamespaceFor(v, { familyAccounts: false })!;
      expect(i18n.hasResourceBundle('en', ns)).toBe(true);
      expect(i18n.hasResourceBundle('he', ns)).toBe(true);
    }
  });

  it('keeps the vertical wording where both define a key', () => {
    const ns = overlayNamespaceFor('photographer', { familyAccounts: false })!;
    const t = i18n.getFixedT('en', ns);
    expect(t('pages.people.empty_message')).toBe(photographer['pages.people.empty_message']);
    expect(t('settings.offline_payments.title')).toBe(noFamilies.en['settings.offline_payments.title']);
    expect(t('pages.enrol_complete.go_to_dashboard')).toBe(base.en['pages.enrol_complete.go_to_dashboard']);
  });
});

function Probe() {
  const { t } = useTranslation();
  return (
    <div>
      <p data-testid="offline">{t('settings.offline_payments.title')}</p>
      <p data-testid="cards">{t('settings.class_cards.shareable_label')}</p>
      <p data-testid="price">{t('form.class.price_families_pay')}</p>
    </div>
  );
}

describe('runtime through LabelsProvider', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  it.each(['photographer', 'beautician'] as const)('%s (family accounts off) sees client wording, en and he', async (kind) => {
    setTenant(kind);
    for (const lng of ['en', 'he'] as const) {
      await setLanguage(lng);
      const { unmount } = renderInApp(<Probe />);
      expect(screen.getByTestId('offline').textContent).toBe(noFamilies[lng]['settings.offline_payments.title']);
      expect(screen.getByTestId('cards').textContent).toBe(noFamilies[lng]['settings.class_cards.shareable_label']);
      expect(screen.getByTestId('price').textContent).toBe(noFamilies[lng]['form.class.price_families_pay']);
      unmount();
    }
  });

  it('dance (family accounts on) keeps the family wording', async () => {
    setTenant('dance');
    renderInApp(<Probe />);
    expect(screen.getByTestId('offline').textContent).toBe(base.en['settings.offline_payments.title']);
    expect(screen.getByTestId('cards').textContent).toBe(base.en['settings.class_cards.shareable_label']);
  });

  it('a dance studio that switched family accounts off loses the family wording', async () => {
    setTenant('dance', {
      profile: { paymentFlow: 'recurring', teachesClasses: true, familyAccounts: false, clientBooking: true },
    });
    renderInApp(<Probe />);
    expect(screen.getByTestId('offline').textContent).toBe(noFamilies.en['settings.offline_payments.title']);
  });
});

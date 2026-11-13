// @vitest-environment jsdom
/**
 * Settings page polish:
 *  - Branding labels are translated in Hebrew (no English fallbacks leaking);
 *  - "Studio" is the default wording for every tenant (dance included). It is
 *    only an i18n default: a tenant's own entity labels (tenants.labels) still win.
 */
import { useTranslation } from 'react-i18next';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import heBase from '@/i18n/he.json';
import TenantSettingsPage from '@/pages/TenantSettingsPage';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

/** A Settings tab's name, as the tabs along the top of Settings show it (t(labelKey)). */
function TabLabelProbe() {
  const { t } = useTranslation();
  return <p data-testid="profile-tab">{t('settings.tabs.profile')}</p>;
}

describe('Branding labels in Hebrew', () => {
  beforeEach(async () => {
    setTenant('dance');
    await setLanguage('he');
  });

  it('renders the page title, colour, font and save labels in Hebrew', () => {
    renderInApp(<TenantSettingsPage />);
    const he = heBase.settings;
    for (const text of [
      he.title,
      he.branding.colors,
      he.branding.primaryColor,
      he.branding.accentColor,
      he.branding.fontPair,
      he.branding.fontPairHint,
      he.branding.fontPairs.opalswift,
      heBase.common.saveChanges,
    ]) {
      expect(screen.getAllByText(text).length, text).toBeGreaterThan(0);
    }
    for (const english of ['Settings', 'Colors', 'Primary Color', 'Accent Color', 'Font Pair', 'Headings and text across your studio\'s pages. Each choice covers English and Hebrew.', 'Save Changes']) {
      expect(screen.queryByText(english), english).toBeNull();
    }
    expect(screen.getByRole('radio', { name: /^אמין/ })).toBeInTheDocument();
  });
});

describe('Studio is the default wording', () => {
  const cases = [
    ['dance', 'en', 'Name & contact'],
    ['dance', 'he', 'שם ופרטי קשר'],
    ['photographer', 'en', 'Name & contact'],
    ['photographer', 'he', 'שם ופרטי קשר'],
  ] as const;

  it.each(cases)('%s / %s profile tab shows "%s"', async (kind, lng, label) => {
    setTenant(kind);
    await setLanguage(lng);
    renderInApp(
      <>
        <TabLabelProbe />
        <TenantSettingsPage />
      </>,
    );
    expect(screen.getByTestId('profile-tab').textContent).toBe(label);
    expect(screen.queryByText(/school|בית הספר/i)).toBeNull();
  });
});

function LabelsProbe() {
  const { labels } = useEntityLabels();
  return (
    <p data-testid="labels">
      {labels.contact.singular}|{labels.offering.plural}
    </p>
  );
}

describe('tenant-chosen terms still win over the new default', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  it('a tenant with custom labels keeps them; the default tab text is unaffected', () => {
    const custom = {
      contact: { singular: 'Academy pupil', plural: 'Academy pupils' },
      offering: { singular: 'School course', plural: 'School courses' },
    };
    setTenant('dance', { entity_label_overrides: custom });
    renderInApp(
      <>
        <LabelsProbe />
        <TabLabelProbe />
        <TenantSettingsPage />
      </>,
    );
    expect(screen.getByTestId('labels').textContent).toBe('Academy pupil|School courses');
    expect(screen.getByTestId('profile-tab').textContent).toBe('Name & contact');
  });

  it('a tenant without custom labels gets the preset terms and "Studio"', () => {
    setTenant('dance');
    renderInApp(
      <>
        <LabelsProbe />
        <TabLabelProbe />
        <TenantSettingsPage />
      </>,
    );
    expect(screen.getByTestId('labels').textContent).toBe('Student|Classes');
    expect(screen.getByTestId('profile-tab').textContent).toBe('Name & contact');
  });
});

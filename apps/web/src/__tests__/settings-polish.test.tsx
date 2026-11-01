// @vitest-environment jsdom
/**
 * Settings page polish:
 *  - phone layout: the shell stacks (flex-col) and nothing inline overrides it;
 *  - Branding labels are translated in Hebrew (no English fallbacks leaking);
 *  - "Studio" is the default wording for every tenant (dance included). It is
 *    only an i18n default: a tenant's own entity labels (tenants.labels) still win.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import heBase from '@/i18n/he.json';
import TenantSettingsPage from '@/pages/TenantSettingsPage';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

function layoutRoot(): HTMLElement {
  const root = screen.getByRole('tabpanel').parentElement;
  if (!root) throw new Error('settings layout root not found');
  return root;
}

describe('Settings layout at phone width', () => {
  beforeEach(() => setTenant('dance'));

  it.each(['en', 'he'] as const)('stacks on mobile and only becomes a row from md up (%s)', async (lng) => {
    await setLanguage(lng);
    renderInApp(<TenantSettingsPage />);
    const root = layoutRoot();
    expect(root).toHaveClass('flex', 'flex-col', 'md:flex-row');
    // An inline flex-direction beats the flex-col class and squeezed the phone layout.
    expect(root.style.flexDirection).toBe('');
    expect(root.getAttribute('dir')).toBe(lng === 'he' ? 'rtl' : 'ltr');
  });
});

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
      he.branding.selectFontPair,
      he.branding.fontPreview,
      heBase.common.saveChanges,
    ]) {
      expect(screen.getAllByText(text).length, text).toBeGreaterThan(0);
    }
    for (const english of ['Settings', 'Colors', 'Primary Color', 'Accent Color', 'Font Pair', 'Select Font Pair', 'Font Preview', 'Save Changes']) {
      expect(screen.queryByText(english), english).toBeNull();
    }
    expect(screen.getByRole('option', { name: /^אמין/ })).toBeInTheDocument();
  });
});

describe('Studio is the default wording', () => {
  const cases = [
    ['dance', 'en', 'Studio profile'],
    ['dance', 'he', 'פרופיל הסטודיו'],
    ['photographer', 'en', 'Studio profile'],
    ['photographer', 'he', 'פרופיל הסטודיו'],
  ] as const;

  it.each(cases)('%s / %s profile tab shows "%s"', async (kind, lng, label) => {
    setTenant(kind);
    await setLanguage(lng);
    renderInApp(<TenantSettingsPage />);
    // Desktop sidebar + mobile strip each render the tab.
    expect(screen.getAllByRole('tab', { name: label })).toHaveLength(2);
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
        <TenantSettingsPage />
      </>,
    );
    expect(screen.getByTestId('labels').textContent).toBe('Academy pupil|School courses');
    expect(screen.getAllByRole('tab', { name: 'Studio profile' })).toHaveLength(2);
  });

  it('a tenant without custom labels gets the preset terms and "Studio"', () => {
    setTenant('dance');
    renderInApp(
      <>
        <LabelsProbe />
        <TenantSettingsPage />
      </>,
    );
    expect(screen.getByTestId('labels').textContent).toBe('Student|Classes');
    expect(screen.getAllByRole('tab', { name: 'Studio profile' })).toHaveLength(2);
  });
});

// @vitest-environment jsdom
/**
 * Photographer screens beyond the Clients page: no class/level/season/family
 * wording or options. Dance tenants keep everything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { NotificationBlastForm } from '@/features/notifications-admin/components/NotificationBlastForm';
import { FinancePeriodSelector } from '@/features/finance-admin/components/FinancePeriodSelector';
import { managePackagesPath } from '@/features/classes/lib/managePackagesPath';
import i18n from '@/i18n/i18n';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/features/classes/hooks/useClasses', () => ({ useClasses: () => ({ classes: [], isLoading: false }) }));
vi.mock('@/features/levels/hooks/useLevels', () => ({ useLevels: () => ({ levels: [], isLoading: false }) }));
vi.mock('@/features/notifications-admin/hooks/useNotificationBlast', () => ({
  useNotificationBlast: () => ({ previewRecipients: vi.fn(), isPreviewing: false, sendBlast: vi.fn(), isSending: false }),
}));

beforeEach(async () => {
  await setLanguage('en');
});

describe('notification audiences', () => {
  it('photographer: All clients + By account only (en, he)', async () => {
    setTenant('photographer');
    const { unmount } = renderInApp(<NotificationBlastForm />);
    expect(screen.getByRole('radio', { name: 'All clients' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'By account' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'By level' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'By class' })).toBeNull();
    unmount();
    await setLanguage('he');
    renderInApp(<NotificationBlastForm />);
    expect(screen.getByRole('radio', { name: 'כל הלקוחות' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'לפי רמה' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'כל המשפחות' })).toBeNull();
  });

  it('dance: unchanged', () => {
    setTenant('dance');
    renderInApp(<NotificationBlastForm />);
    for (const name of ['All families', 'By level', 'By class', 'By account']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
  });
});

describe('finance period', () => {
  it('photographer: no "Active term"', () => {
    setTenant('photographer');
    renderInApp(<FinancePeriodSelector />);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['This month', 'Last month']);
  });

  it('dance: keeps "Active term"', () => {
    setTenant('dance');
    renderInApp(<FinancePeriodSelector />);
    expect(screen.getByRole('option', { name: 'Active term' })).toBeInTheDocument();
  });
});

describe('manage packages link', () => {
  it('photographers go to Packages, dance to the class manager', () => {
    expect(managePackagesPath('photographer')).toBe('/admin/setup/services');
    expect(managePackagesPath('dance-studio')).toBe('/admin/setup/classes');
    expect(managePackagesPath(null)).toBe('/admin/setup/classes');
  });
});

describe('photographer overlay wording', () => {
  const t = (lng: 'en' | 'he', key: string) => i18n.getFixedT(lng, 'photographer')(key);
  it.each([
    ['finance.charge_type.initial', 'Shoot payment', 'תשלום צילום'],
    ['pages.billing.empty_message', 'Create a billing account to link clients and track payments.', 'צרו חשבון תשלום כדי לקשר לקוחות ולעקוב אחר תשלומים.'],
    ['pages.admin_classes.title', 'Manage packages', 'ניהול חבילות'],
    ['pages.admin_classes.description', 'Create, edit and delete your photography packages.', 'יצירה, עריכה ומחיקה של חבילות הצילום שלך.'],
  ])('%s', (key, en, he) => {
    expect(t('en', key)).toBe(en);
    expect(t('he', key)).toBe(he);
  });
});

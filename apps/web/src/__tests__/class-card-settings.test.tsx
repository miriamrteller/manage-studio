// @vitest-environment jsdom
/**
 * Classes → Class cards (was a Settings tab): off by default, the studio admin switches it on, adult classes are
 * ticked on a new card, and studios that don't teach classes don't see the tab.
 * Run: pnpm -C apps/web test class-card-settings.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import ClassCardsSettingsPage from '@/pages/ClassCardsSettingsPage';
import { matchesProfile, navigationConfig } from '@/components/Navigation/navigationConfig';
import { profileForSkin } from './helpers/skinProfiles';
import { defaultCoveredClasses } from '@/features/class-cards/service';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u-1' } }, isLoading: false }) }));

const db = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  classes: [
    { id: 'o-kids', name: 'Kids ballet', min_age: 6 },
    { id: 'o-adult', name: 'Adult yoga', min_age: 18 },
  ],
}));

vi.mock('@/lib/supabase', () => {
  const result = (table: string) => {
    if (table === 'tenant_class_card_settings') return { data: db.settings, error: null };
    if (table === 'offerings') return { data: db.classes, error: null };
    if (table === 'class_card_types') return { data: [], error: null };
    return { data: null, error: null };
  };
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'in']) b[m] = () => b;
    b.maybeSingle = async () => result(table);
    b.single = async () => ({ data: { lead_form: {} }, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve(result(table));
    b.upsert = async (row: Record<string, unknown>) => {
      db.upserts.push(row);
      db.settings = { ...row };
      return { error: null };
    };
    return b;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    },
  };
});

beforeEach(async () => {
  db.settings = null;
  db.upserts = [];
  setTenant('dance');
  await setLanguage('en');
});

describe('defaultCoveredClasses', () => {
  it('ticks the 18+ classes, or every class when none are marked 18+', () => {
    expect(defaultCoveredClasses(db.classes)).toEqual(['o-adult']);
    expect(defaultCoveredClasses([{ id: 'a', name: 'A', min_age: null }, { id: 'b', name: 'B', min_age: 8 }])).toEqual(['a', 'b']);
  });
});

describe('Classes → Class cards', () => {
  it('is off to start with, and the admin switches it on', async () => {
    renderInApp(<ClassCardsSettingsPage />, { path: '/admin/classes/cards' });
    const toggle = await screen.findByRole('checkbox', { name: 'Sell class cards' });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('heading', { name: 'Your cards' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0]).toMatchObject({ enabled: true, cancel_cutoff_hours: 12, extension_months: 3 });
  });

  it('a new card is prefilled: 10 classes, 3 months, personal, adult classes ticked', async () => {
    db.settings = { tenant_id: 't', enabled: true, cancel_cutoff_hours: 12, extension_months: 3 };
    renderInApp(<ClassCardsSettingsPage />, { path: '/admin/classes/cards' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add a 10-class card' }));
    expect(screen.getByLabelText('Number of classes')).toHaveValue(10);
    expect(screen.getByLabelText('Name clients see')).toHaveValue('10 classes');
    expect(screen.getByLabelText(/Valid for/)).toHaveValue(3);
    expect(screen.getByRole('checkbox', { name: /Family members/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Adult yoga' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Kids ballet' })).not.toBeChecked();
  });

  it('is not shown to studios that do not teach classes', () => {
    const cards = navigationConfig.find((item) => item.path === '/admin/classes/cards')!;
    expect(matchesProfile(cards, profileForSkin('photographer'))).toBe(false);
    expect(matchesProfile(cards, profileForSkin('dance-studio'))).toBe(true);
  });
});

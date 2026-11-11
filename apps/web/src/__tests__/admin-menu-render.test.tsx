// @vitest-environment jsdom
/**
 * The studio admin's real menu, rendered: working pages at the top level (no Browse or
 * Administration group to open), Leads first, the business's own words, Finance and Setup as
 * groups. Parents, students and clients keep their menu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderInApp, setLanguage, setTenant, type FakeTenantKind } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const auth = vi.hoisted(() => ({ roles: ['tenant_admin'] as string[] }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u1', email: 'a@x.test', role: auth.roles }, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/hooks/useFeatureGate', () => ({ useFeatureGate: () => ({ hasFeature: () => true }) }));
vi.mock('@/features/scheduling/useBookingEnabled', () => ({ useBookingEnabled: () => true }));
vi.mock('@/components/ReportProblem', () => ({ useReportProblem: () => ({ canReport: false, openReportProblem: vi.fn() }) }));
vi.mock('@/components/Navigation/NavDrawerContext', () => ({
  useNavDrawer: () => ({
    isOpen: true, isPinned: true, isOverlay: false, close: vi.fn(), togglePin: vi.fn(),
    closeOnNavigate: vi.fn(), menuButtonRef: { current: null },
  }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, rpc: vi.fn(), from: vi.fn() } }));

import { NavDrawer } from '@/components/Navigation/NavDrawer';

/** The menu list itself (the pinned drawer is also a navigation landmark). */
function menuNav(): HTMLElement {
  const nav = screen.getAllByRole('navigation').find((n) => n.tagName === 'NAV');
  if (!nav) throw new Error('menu not found');
  return nav;
}

function menuLabels(): string[] {
  const nav = menuNav();
  return within(nav)
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '');
}

function renderMenu(kind: FakeTenantKind, path = '/admin/students') {
  setTenant(kind);
  return renderInApp(<NavDrawer />, { path });
}

beforeEach(() => {
  auth.roles = ['tenant_admin'];
});
afterEach(async () => {
  await setLanguage('en');
});

describe('studio admin menu (English)', () => {
  it('dance: Leads, Students, Families, Classes, Shop, Appointments, Notifications, then the Finance and Setup groups', async () => {
    await setLanguage('en');
    renderMenu('dance');
    expect(menuLabels().slice(0, 9)).toEqual([
      'Leads', 'Students', 'Families', 'Classes', 'Shop', 'Appointments', 'Notifications', 'Finance', 'Setup',
    ]);
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Book/ })).toBeNull();
  });

  it('photographer: Leads first, then the contacts, shoots and quotes words', async () => {
    await setLanguage('en');
    renderMenu('photographer', '/admin/jobs');
    const labels = menuLabels();
    expect(labels[0]).toBe('Leads');
    expect(labels).not.toContain('Families');
    expect(labels).not.toContain('Browse');
    expect(labels).toContain('Quotes');
    expect(labels.indexOf('Quotes')).toBeLessThan(labels.indexOf('Notifications'));
    expect(labels.indexOf('Finance')).toBeGreaterThan(labels.indexOf('Notifications'));
  });

  it('beautician: only what fits an appointment business', async () => {
    await setLanguage('en');
    renderMenu('beautician', '/admin/appointments');
    const labels = menuLabels();
    expect(labels[0]).toBe('Leads');
    expect(labels).toContain('Appointments');
    expect(labels).not.toContain('Families');
    expect(labels).not.toContain('Classes');
    expect(labels).not.toContain('Quotes');
  });

  it('generic: same as dance', async () => {
    await setLanguage('en');
    renderMenu('generic');
    expect(menuLabels().slice(0, 7)).toEqual(['Leads', 'Students', 'Families', 'Classes', 'Shop', 'Appointments', 'Notifications']);
  });

  it('marks the current page with aria-current and opens Setup/Finance with the keyboard-reachable toggle', async () => {
    await setLanguage('en');
    renderMenu('dance', '/admin/families');
    const nav = menuNav();
    expect(within(nav).getByRole('button', { name: 'Families' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Leads' })).not.toHaveAttribute('aria-current');
    const finance = within(nav).getByRole('button', { name: 'Finance' });
    expect(finance).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(finance);
    expect(finance).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('button', { name: /payments/i })).toBeInTheDocument();
  });

  it('opens the Setup group on a setup page, and the old "Manage classes" is not duplicated there', async () => {
    await setLanguage('en');
    renderMenu('dance', '/admin/setup/settings');
    const nav = menuNav();
    expect(within(nav).getByRole('button', { name: 'Setup' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).queryByRole('button', { name: /manage classes/i })).toBeNull();
  });
});

describe('studio admin menu (Hebrew)', () => {
  it('dance: the same flat list in Hebrew, Leads first', async () => {
    await setLanguage('he');
    renderMenu('dance');
    const labels = menuLabels();
    expect(labels[0]).toBe('לידים');
    expect(labels).toContain('שיעורים');
  });
});

describe('other roles', () => {
  it('a parent still sees Classes, Book and their own page, not the admin list', async () => {
    await setLanguage('en');
    auth.roles = ['account_holder'];
    renderMenu('dance', '/dashboard/portal');
    const labels = menuLabels();
    expect(labels.slice(0, 4)).toEqual(['Home', 'Classes', 'Book', 'My Account']);
    expect(labels).not.toContain('Leads');
  });
});

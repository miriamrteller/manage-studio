// @vitest-environment jsdom
/**
 * The studio admin's real menu, rendered: one flat list of areas (no groups to open), each with
 * an icon; the pages of an area are tabs along the top of its pages. Full size or icons only.
 * Parents, students and clients keep their menu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
const drawer = vi.hoisted(() => ({ iconsOnly: false, toggleIconsOnly: () => {} }));
vi.mock('@/components/Navigation/NavDrawerContext', () => ({
  useNavDrawer: () => ({
    isOpen: true, isPinned: true, isOverlay: false, isIconsOnly: drawer.iconsOnly, close: vi.fn(),
    toggleIconsOnly: drawer.toggleIconsOnly, closeOnNavigate: vi.fn(), menuButtonRef: { current: null },
  }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, rpc: vi.fn(), from: vi.fn() } }));

import { NavDrawer } from '@/components/Navigation/NavDrawer';
import { AreaTabs } from '@/components/Navigation/AreaTabs';

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
    .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');
}

function renderMenu(kind: FakeTenantKind, path = '/admin/people') {
  setTenant(kind);
  return renderInApp(<NavDrawer />, { path });
}

function renderTabs(kind: FakeTenantKind, path: string) {
  setTenant(kind);
  return renderInApp(<AreaTabs />, { path: path.split('?')[0], initialEntry: path });
}

function tabLabels(): string[] {
  return within(screen.getByRole('navigation')).getAllByRole('link').map((a) => a.textContent ?? '');
}

beforeEach(() => {
  auth.roles = ['tenant_admin'];
  drawer.iconsOnly = false;
});
afterEach(async () => {
  await setLanguage('en');
});

describe('studio admin menu (English)', () => {
  it('dance: Home, Leads, Students, Classes, Bookings, Shop, Finance, Settings, with no groups', async () => {
    await setLanguage('en');
    renderMenu('dance');
    expect(menuLabels()).toEqual(['Home', 'Leads', 'Students', 'Classes', 'Bookings', 'Shop', 'Finance', 'Settings']);
    expect(menuNav().querySelector('[aria-expanded]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
  });

  it('photographer: Clients and Shoots, no Families, Classes or separate Bookings', async () => {
    await setLanguage('en');
    renderMenu('photographer', '/admin/projects');
    expect(menuLabels()).toEqual(['Home', 'Leads', 'Clients', 'Shoots', 'Photo shop', 'Finance', 'Settings']);
  });

  it('another project business says Projects, with a briefcase rather than a camera', async () => {
    await setLanguage('en');
    setTenant('generic', {
      business_preset: 'services',
      profile: { paymentFlow: 'project', teachesClasses: false, familyAccounts: false, clientBooking: false },
    });
    renderInApp(<NavDrawer />, { path: '/admin/projects' });
    expect(menuLabels()).toContain('Projects');
    expect(menuLabels()).not.toContain('Shoots');
  });

  it('beautician: only what fits an appointment business', async () => {
    await setLanguage('en');
    renderMenu('beautician', '/admin/bookings/diary');
    const labels = menuLabels();
    expect(labels).toContain('Bookings');
    expect(labels).not.toContain('Classes');
    expect(labels).not.toContain('Shoots');
  });

  it('marks the area of the current page, also on one of its tabs', async () => {
    await setLanguage('en');
    renderMenu('dance', '/admin/people/families');
    const nav = menuNav();
    expect(within(nav).getByRole('button', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Leads' })).not.toHaveAttribute('aria-current');
  });

  it('every line has an icon', async () => {
    await setLanguage('en');
    renderMenu('dance');
    for (const button of within(menuNav()).getAllByRole('button')) {
      expect(button.querySelector('svg')).not.toBeNull();
    }
  });

  it('icons only: names are hidden but still read out and shown on hover', async () => {
    await setLanguage('en');
    drawer.iconsOnly = true;
    renderMenu('dance');
    const bookings = within(menuNav()).getByRole('button', { name: 'Bookings' });
    expect(bookings.textContent).toBe('');
    expect(bookings).toHaveAttribute('title', 'Bookings');
    expect(screen.getByRole('button', { name: 'Show full menu' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('full size: the switch offers icons only', async () => {
    await setLanguage('en');
    renderMenu('dance');
    expect(screen.getByRole('button', { name: 'Show icons only' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('tabs along the top of an area', () => {
  it('Shoots: one place for shoots, the diary, packages and quotes, saying what the open tab is for', async () => {
    await setLanguage('en');
    renderTabs('photographer', '/admin/bookings/diary');
    expect(tabLabels()).toEqual(['Shoots', 'Diary', 'Packages', 'Quotes']);
    expect(screen.getByRole('link', { name: 'Diary' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Packages' })).toHaveAttribute('href', '/admin/bookings/packages');
    expect(screen.getByText(/Everything with a date/)).toBeInTheDocument();
  });

  it('Bookings for an appointment business: Services first, then Diary', async () => {
    await setLanguage('en');
    renderTabs('beautician', '/admin/bookings/diary');
    expect(tabLabels()).toEqual(['Services', 'Diary']);
  });

  it('Classes: classes, levels, seasons, teachers, class cards', async () => {
    await setLanguage('en');
    renderTabs('dance', '/admin/classes/seasons');
    expect(tabLabels()).toHaveLength(5);
    expect(tabLabels()[0]).toBe('Classes');
    expect(tabLabels()).toContain('Class cards');
  });

  it('Settings: each section is a tab with its own address', async () => {
    await setLanguage('en');
    renderTabs('dance', '/admin/settings?tab=legal');
    expect(tabLabels()).toContain('Name & contact');
    expect(screen.getByRole('link', { name: 'Legal documents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Legal documents' })).toHaveAttribute('href', '/admin/settings?tab=legal');
    expect(screen.getByText(/privacy policy/)).toBeInTheDocument();
  });

  it('no tabs for an area with one page (Home)', async () => {
    await setLanguage('en');
    renderTabs('dance', '/admin');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('Hebrew tab names', async () => {
    await setLanguage('he');
    renderTabs('photographer', '/admin/bookings/diary');
    expect(tabLabels()).toEqual(['צילומים', 'יומן', 'חבילות', 'הצעות מחיר']);
  });
});

describe('studio admin menu (Hebrew)', () => {
  it('dance: the same flat list in Hebrew', async () => {
    await setLanguage('he');
    renderMenu('dance');
    expect(menuLabels()).toEqual(['בית', 'לידים', 'תלמידים', 'שיעורים', 'תורים', 'חנות', 'כספים', 'הגדרות']);
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

// @vitest-environment jsdom
/**
 * The studio's public homepage ("/"): fitted to the business type, built only from what the
 * studio has set up, never blocked by what it has not, and "/classes" only for class studios.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderInApp, setLanguage, setTenant, type FakeTenantKind } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const h = vi.hoisted(() => ({
  roles: [] as string[],
  classes: [] as Array<Record<string, unknown>>,
  bookable: [] as Array<Record<string, unknown>>,
  legal: null as null | { contactEmail: string; published: boolean; profile: Record<string, string> },
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: h.roles.length ? { id: 'u1', role: h.roles } : null, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/features/classes/hooks', () => ({ useClasses: () => ({ classes: h.classes, isLoading: false, error: null }) }));
vi.mock('@/features/scheduling/bookingService', () => ({
  BookingService: { listBookableOfferings: async () => h.bookable },
}));
vi.mock('@/legal/useLegalDocument', () => ({ useTenantLegalProfile: () => ({ data: h.legal, isLoading: false }) }));
vi.mock('@/pages/ClassesPage', () => ({ ClassesPage: () => <p>CLASSES PAGE</p> }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { getSession: vi.fn() } } }));

import HomePage from '@/pages/HomePage';
import ClassesRoute from '@/pages/ClassesRoute';
import {
  homeButtons,
  studioHasBooking,
  studioHasClasses,
} from '@/lib/studioSections';

const CLASS = { id: 'c1', name: 'Ballet Grade 2', category_name: 'Ballet' };
const SERVICE = { id: 's1', name: 'Family session', duration_mins: 60, price_minor: 90000, currency: 'ILS', location: null };

function renderHome(kind: FakeTenantKind, extra: Record<string, unknown> = {}) {
  setTenant(kind, extra);
  return renderInApp(<HomePage />, { path: '/' });
}

beforeEach(async () => {
  h.roles = [];
  h.classes = [];
  h.bookable = [];
  h.legal = null;
  await setLanguage('en');
});

describe('studio sections (the one "does this studio have X" check)', () => {
  it('class businesses have classes; appointment businesses do not', () => {
    expect(studioHasClasses({ vertical: 'dance-studio' })).toBe(true);
    expect(studioHasClasses({ vertical: 'generic' })).toBe(true);
    expect(studioHasClasses({ vertical: null })).toBe(true);
    expect(studioHasClasses({ vertical: 'photographer' })).toBe(false);
    expect(studioHasClasses({ vertical: 'beautician' })).toBe(false);
  });

  it('booking follows the feature flag', () => {
    expect(studioHasBooking({ enabledFeatures: [] })).toBe(false);
    expect(studioHasBooking({ enabledFeatures: ['scheduling:booking.client'] })).toBe(true);
  });

  it('the hero buttons fit the business', () => {
    expect(homeButtons({ vertical: 'dance-studio' })).toEqual({
      primary: { kind: 'classes', path: '/classes' }, secondary: { kind: 'enquiry', path: '/inquire' },
    });
    expect(homeButtons({ vertical: 'photographer' }).primary.kind).toBe('enquiry');
    expect(homeButtons({ vertical: 'photographer', enabledFeatures: ['scheduling:booking.client'] }).secondary?.kind).toBe('book');
    expect(homeButtons({ vertical: 'beautician', enabledFeatures: ['scheduling:booking.client'] }).primary.kind).toBe('book');
    expect(homeButtons({ vertical: 'beautician' }).primary.kind).toBe('enquiry');
  });
});

describe('homepage per business type', () => {
  it('dance: name, intro, See classes + enquiry, a classes preview, contact', async () => {
    h.classes = [CLASS];
    h.legal = { contactEmail: 'office@studio.test', published: true, profile: { phone: '03-555-0100', address: '1 Herzl St, Haifa' } };
    renderHome('dance');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Studio');
    expect(screen.getByText(/Welcome to Test Studio\. See what is on/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^See / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send an enquiry' })).toBeInTheDocument();
    expect(await screen.findByText('Ballet Grade 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^All / })).toHaveAttribute('href', '/classes');
    expect(screen.getByRole('link', { name: 'office@studio.test' })).toHaveAttribute('href', 'mailto:office@studio.test');
    expect(screen.getByRole('link', { name: '03-555-0100' })).toHaveAttribute('href', 'tel:035550100');
    expect(screen.getByText('1 Herzl St, Haifa')).toBeInTheDocument();
  });

  it('photographer: "Ask about a shoot"-style enquiry first, packages when booking is on, no classes', async () => {
    h.bookable = [SERVICE];
    h.classes = [CLASS];
    renderHome('photographer', { enabled_features: ['scheduling:booking.client'] });
    expect(screen.getByText(/Photography by Test Studio/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send an enquiry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book' })).toBeInTheDocument();
    expect(await screen.findByText('Family session')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book' })).toHaveAttribute('href', '/book/s1');
    expect(screen.queryByText('Ballet Grade 2')).toBeNull();
    expect(screen.queryByRole('link', { name: /^All / })).toBeNull();
  });

  it('beautician with booking: Book first and services listed', async () => {
    h.bookable = [SERVICE];
    renderHome('beautician', { enabled_features: ['scheduling:booking.client'] });
    expect(screen.getByText(/Book your next appointment online/)).toBeInTheDocument();
    expect(await screen.findByText('Family session')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)[0]).toBe('Book');
  });

  it('beautician without booking: enquiry is the main button and no services section', () => {
    h.bookable = [SERVICE];
    renderHome('beautician');
    expect(screen.getAllByRole('button').map((b) => b.textContent)[0]).toBe('Send an enquiry');
    expect(screen.queryByText('Book online')).toBeNull();
  });

  it('a studio with almost nothing set up still gets a page: name, intro, enquiry, contact; no empty sections, no phone/address when not published', () => {
    h.legal = { contactEmail: 'hello@studio.test', published: false, profile: { phone: '03-555-0100', address: 'Secret St' } };
    renderHome('generic');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Studio');
    expect(screen.getByText(/See what we offer, or get in touch/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send an enquiry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hello@studio.test' })).toBeInTheDocument();
    expect(screen.queryByText('Secret St')).toBeNull();
    expect(screen.queryByText('03-555-0100')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)).toEqual(['Get in touch']);
  });

  it('has no images (no people, no photos): only decorative icons', () => {
    h.classes = [CLASS];
    const { container } = renderHome('dance');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('Hebrew: the same page in Hebrew', async () => {
    await setLanguage('he');
    h.classes = [CLASS];
    renderHome('dance');
    expect(screen.getByText(/ברוכים הבאים אל Test Studio/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שליחת פנייה' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /^כל ה/ })).toHaveAttribute('href', '/classes');
    expect(screen.getByRole('heading', { name: 'יצירת קשר' })).toBeInTheDocument();
  });
});

describe('who is looking', () => {
  it('a signed-out visitor sees no account links', () => {
    renderHome('dance');
    expect(screen.queryByRole('link', { name: 'Open your dashboard' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'My Account' })).toBeNull();
  });

  it('a signed-in parent gets their account link, not a redirect', () => {
    h.roles = ['account_holder'];
    renderHome('dance');
    expect(screen.getByRole('link', { name: 'My Account' })).toHaveAttribute('href', '/dashboard/portal');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('a signed-in student gets their dashboard link', () => {
    h.roles = ['student'];
    renderHome('dance');
    expect(screen.getByRole('link', { name: 'Student Dashboard' })).toHaveAttribute('href', '/dashboard/student');
  });

  it('a studio admin sees the homepage with an "Open your dashboard" link', () => {
    h.roles = ['tenant_admin'];
    renderHome('dance');
    expect(screen.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute('href', '/admin/setup');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('/classes only for studios that run classes', () => {
  it('a class studio sees the classes page', async () => {
    setTenant('dance');
    renderInApp(<ClassesRoute />, { path: '/classes', extraRoutes: { '/': <p>HOME</p> } });
    expect(await screen.findByText('CLASSES PAGE')).toBeInTheDocument();
  });

  it('a photographer or beautician is sent to the homepage', async () => {
    for (const kind of ['photographer', 'beautician'] as const) {
      setTenant(kind);
      const { unmount } = renderInApp(<ClassesRoute />, { path: '/classes', initialEntry: '/classes', extraRoutes: { '/': <p>HOME</p> } });
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
      expect(screen.queryByText('CLASSES PAGE')).toBeNull();
      unmount();
    }
  });
});

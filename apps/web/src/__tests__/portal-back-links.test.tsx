// @vitest-environment jsdom
/**
 * A client who finishes an action on a public page (pay, quote, contract) gets
 * a way back to the client portal: signed in → straight to /dashboard/portal,
 * signed out → login, which returns to the portal. Plus the menu per vertical:
 * dance unchanged, photographer trimmed, photographer clients see the portal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import i18n from '@/i18n/i18n';
import EnrolCompletePage from '@/pages/EnrolCompletePage';
import { PublicPayRequest } from '@/features/jobs/components/PublicPayRequest';
import { PublicQuoteView } from '@/features/quotes/components/public/PublicQuoteView';
import { backToPortalTarget } from '@/features/jobs/components/BackToPortalButton';
import {
  buildNavSections,
  matchesTenantFilter,
  matchesVertical,
  navigationConfig,
  type NavItem,
} from '@/components/Navigation/navigationConfig';
import type { VerticalId } from '@shared/index';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string[] } }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: auth.user, isLoading: false, isProfileChecked: true }),
}));

const invoke = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })), signInWithOtp: vi.fn() },
    rpc: (...args: unknown[]) => rpc(...args),
    from: vi.fn(),
  },
}));

const payRequest = vi.hoisted(() => ({ status: 'paid' as string }));
vi.mock('@/features/jobs/services/jobPaymentService', () => ({
  JobPaymentService: {
    publicRequest: vi.fn(async () => ({
      request: {
        id: 'r1', label: 'Deposit', amountMinor: 30000, currency: 'ILS', dueDate: '2026-11-01',
        status: payRequest.status, paidAt: null, maxInstallments: 1, jobDate: '2026-11-20', jobCancelled: false,
        studio: { name: 'Lumen Studio', language: 'en', primaryColor: null, accentColor: null, logoUrl: null },
        paymentProvider: 'ypay',
      },
    })),
  },
}));

const CLIENT = { id: 'u1', email: 'client@example.com', role: ['account_holder'] };
const ADMIN = { id: 'u2', email: 'studio@example.com', role: ['tenant_admin'] };
const QUOTE_TOKEN = 'a'.repeat(64);
const ENG = '11111111-1111-4111-8111-111111111111';

/** Shows where login was asked to return to. */
function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  return <p>LOGIN PAGE from={from}</p>;
}

const DESTINATIONS = {
  '/dashboard/portal': <p>PORTAL PAGE</p>,
  '/dashboard': <p>DASHBOARD PAGE</p>,
  '/login': <LoginProbe />,
};

class ImmediateIntersectionObserver {
  constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() { this.cb([{ isIntersecting: true }]); }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

beforeEach(async () => {
  await setLanguage('en');
  setTenant('photographer');
  auth.user = null;
  payRequest.status = 'paid';
  invoke.mockReset();
  rpc.mockReset();
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('backToPortalTarget', () => {
  it('client → portal; other signed-in user → own dashboard; guest → login back to the portal', () => {
    expect(backToPortalTarget(['account_holder'])).toEqual({ to: '/dashboard/portal' });
    expect(backToPortalTarget(['tenant_admin'])).toEqual({ to: '/dashboard' });
    expect(backToPortalTarget(null)).toEqual({ to: '/login', state: { from: '/dashboard/portal' } });
  });
});

describe('/pay/:token after paying', () => {
  const renderPay = () =>
    renderInApp(<PublicPayRequest token="tok" result={null} />, {
      path: '/pay/:token', initialEntry: '/pay/tok', extraRoutes: DESTINATIONS,
    });

  it('signed-in client → "Back to my bookings" opens the portal', async () => {
    auth.user = CLIENT;
    renderPay();
    expect(await screen.findByText(/this payment was received/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to my bookings' }));
    expect(await screen.findByText('PORTAL PAGE')).toBeInTheDocument();
  });

  it('signed out → sign in, returning to the portal', async () => {
    renderPay();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to see my bookings' }));
    expect(await screen.findByText('LOGIN PAGE from=/dashboard/portal')).toBeInTheDocument();
  });

  it('studio user previewing the link → their own dashboard', async () => {
    auth.user = ADMIN;
    renderPay();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to my bookings' }));
    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument();
  });

  it('Hebrew wording', async () => {
    await setLanguage('he');
    auth.user = CLIENT;
    renderPay();
    expect(await screen.findByRole('button', { name: 'חזרה להזמנות שלי' })).toBeInTheDocument();
  });

  it('still open → Pay now stays the main action, back link is secondary', async () => {
    payRequest.status = 'sent';
    renderPay();
    expect(await screen.findByRole('button', { name: 'Pay now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to see my bookings' })).toBeInTheDocument();
  });
});

describe('/quote/:token after accepting', () => {
  const quote = (status: 'sent' | 'accepted') => ({
    status, title: 'Family session', currency: 'ILS', shoot_date: '2026-11-20', valid_until: '2026-12-31',
    notes: null, deposit_percent: 30, total_minor: 100000, deposit_minor: 30000, balance_minor: 70000,
    accepted_at: null, client_name: 'Pat',
    lines: [{ id: 'l1', description: 'Session', qty: 1, unit_price_minor: 100000, line_total_minor: 100000, is_optional: false, is_selected: true }],
  });
  const renderQuote = () =>
    renderInApp(<PublicQuoteView token={QUOTE_TOKEN} />, {
      path: '/quote/:token', initialEntry: `/quote/${QUOTE_TOKEN}`, extraRoutes: DESTINATIONS,
    });

  it('open quote has no back link yet', async () => {
    rpc.mockResolvedValue({ data: quote('sent'), error: null });
    renderQuote();
    expect(await screen.findByRole('button', { name: 'Accept and book' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /my bookings/ })).not.toBeInTheDocument();
  });

  it('accepted, signed in → portal (next step still offered)', async () => {
    auth.user = CLIENT;
    rpc.mockResolvedValue({ data: quote('accepted'), error: null });
    renderQuote();
    expect(await screen.findByRole('button', { name: 'Continue your booking' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to my bookings' }));
    expect(await screen.findByText('PORTAL PAGE')).toBeInTheDocument();
  });

  it('accepted, signed out → login back to the portal', async () => {
    rpc.mockResolvedValue({ data: quote('accepted'), error: null });
    renderQuote();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to see my bookings' }));
    expect(await screen.findByText('LOGIN PAGE from=/dashboard/portal')).toBeInTheDocument();
  });
});

describe('/enrol/complete job contract', () => {
  const PAY_PATH = `/pay/${'d'.repeat(48)}`;
  function mockFunctions(handlers: Record<string, { body: Record<string, unknown>; status?: number }>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const handler = handlers[String(url).split('/functions/v1/')[1] ?? ''];
      if (!handler) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(handler.body), {
        status: handler.status ?? 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
  }
  const renderSign = () =>
    renderInApp(<EnrolCompletePage />, {
      path: '/enrol/complete',
      initialEntry: `/enrol/complete?engagementId=${ENG}&wt=token-1`,
      extraRoutes: { ...DESTINATIONS, '/pay/:token': <p>PAY PAGE</p> },
    });

  it('signed: "Next: pay the deposit" still leads; after "Stay", signed-in client can go back to the portal', async () => {
    auth.user = CLIENT;
    mockFunctions({
      'get-waiver-engagement': { body: { alreadySigned: true, isJob: true } },
      'job-next-step': { body: { next: 'pay_deposit', payPath: PAY_PATH, amountMinor: 30000, currency: 'ILS' } },
    });
    renderSign();
    expect(await screen.findByText('Next: pay the deposit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to my bookings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3500)); });
    expect(screen.queryByText('PAY PAGE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to my bookings' }));
    expect(await screen.findByText('PORTAL PAGE')).toBeInTheDocument();
  }, 15000);

  it('signed, next step unavailable, signed out → login back to the portal (not /dashboard)', async () => {
    mockFunctions({
      'get-waiver-engagement': { body: { alreadySigned: true, isJob: true } },
      'job-next-step': { body: { error: 'token_mismatch' }, status: 403 },
    });
    renderSign();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to see my bookings' }));
    expect(await screen.findByText('LOGIN PAGE from=/dashboard/portal')).toBeInTheDocument();
  });

  it('dance waiver keeps "Go to my dashboard" and no portal link', async () => {
    setTenant('dance');
    mockFunctions({ 'get-waiver-engagement': { body: { alreadySigned: true } } });
    renderSign();
    expect(await screen.findByRole('button', { name: 'Go to my dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /my account|my bookings/i })).not.toBeInTheDocument();
  });
});

describe('menu per vertical', () => {
  const ilTenant = { country: 'IL', payment_provider: 'grow' };
  const paths = (vertical: VerticalId, roles: string[]) =>
    buildNavSections(
      navigationConfig.filter((item: NavItem) => matchesVertical(item, vertical) && matchesTenantFilter(item, ilTenant)),
      roles,
    ).flatMap((section) => section.items.map((item) => item.path));

  it('dance admin menu is unchanged', () => {
    expect(paths('dance-studio', ['tenant_admin'])).toEqual([
      '/classes', '/book',
      '/admin/students', '/admin/families', '/admin/notifications', '/admin/leads', '/admin/appointments',
      '/admin/finance', '/admin/finance/payments', '/admin/finance/expenses', '/admin/finance/expenses/categories',
      '/admin/setup', '/admin/setup/settings', '/admin/setup/bundled-payments', '/admin/setup/billing',
      '/admin/setup/levels', '/admin/setup/terms', '/admin/setup/classes', '/admin/setup/services',
      '/admin/setup/booking', '/admin/setup/waivers',
    ]);
  });

  it('photographer admin menu drops family accounts and bundled payments, keeps booking', () => {
    expect(paths('photographer', ['tenant_admin'])).toEqual([
      '/book',
      '/admin/jobs', '/admin/students', '/admin/notifications', '/admin/leads', '/admin/quotes', '/admin/appointments',
      '/admin/finance', '/admin/finance/payments', '/admin/finance/expenses', '/admin/finance/expenses/categories',
      '/admin/setup', '/admin/setup/settings', '/admin/setup/billing', '/admin/setup/services',
      '/admin/setup/booking', '/admin/setup/waivers',
    ]);
  });

  it('photographer client sees the portal entry, worded "My bookings"', () => {
    expect(paths('photographer', ['account_holder'])).toEqual(['/book', '/dashboard/portal']);
    expect(i18n.getFixedT('en', 'photographer')('nav.my_account')).toBe('My bookings');
    expect(i18n.getFixedT('he', 'photographer')('nav.my_account')).toBe('ההזמנות שלי');
    expect(i18n.getFixedT('en')('nav.my_account')).toBe('My Account');
  });
});

// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AdminPanel } from '@/components/Dashboard/AdminPanel';
import { NeedsYouList } from '@/features/admin-dashboard/components/NeedsYouList';

/**
 * Owner, 24 Nov 2026: Home shows what needs you today ("Needs you"), not setup cards.
 * Each line follows the feature set and work modes, never the business type.
 */
const state = vi.hoisted(() => ({
  on: new Set<string>(),
  projects: true,
  shop: false,
  leads: [] as Array<Record<string, unknown>>,
  jobs: [] as Array<Record<string, unknown>>,
  quotes: [] as Array<Record<string, unknown>>,
  orders: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, unknown>>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()] as const,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${key}(${String(o.count)})` : key),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({ labels: { engagement: { singular: 'Shoot', plural: 'Shoots' } } }),
}));
vi.mock('@/hooks/useHasFeature', () => ({
  useHasFeature: () => ({ hasFeature: (key: string) => state.on.has(key), isLoading: false }),
}));
vi.mock('@/hooks/useWorkModes', () => ({
  useWorkModes: () => ({ classes: false, projects: state.projects, appointments: false, families: false }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1' }) }));
vi.mock('@/lib/tenantProviderRouting', () => ({ getBundledPaymentProviderSlug: () => null }));
vi.mock('@/components/Dashboard/useAdminDashboard', () => ({
  useAdminDashboard: () => ({ overview: null, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/features/admin-dashboard/components/AdminOverviewSection', () => ({ AdminOverviewSection: () => null }));
vi.mock('@/features/finance/components/FinanceHealthCard', () => ({ FinanceHealthCard: () => null }));
vi.mock('@/features/finance-admin/components/CashToConfirm', () => ({ CashToConfirmNotice: () => null }));
vi.mock('@/features/setup-guide', () => ({
  CelebrationBanner: () => null,
  SetupGuideCard: () => null,
  useCelebrations: () => ({ active: null, fewer: false, dismiss: vi.fn(), setFewer: vi.fn() }),
  useSetupGuide: () => ({ visible: false, isLoading: false, reopen: vi.fn(), progress: { complete: true }, facts: {} }),
}));
vi.mock('@/features/crm/hooks/useLeads', () => ({ useLeads: () => ({ leads: state.leads, isLoading: false }) }));
vi.mock('@/features/jobs/hooks/useJobs', () => ({ useJobs: () => ({ jobs: state.jobs, isLoading: false }) }));
vi.mock('@/features/jobs/hooks/usePhotoShop', () => ({
  usePhotoShopEnabled: () => state.shop,
  useStudioPhotoOrders: () => ({ data: state.orders, isLoading: false }),
}));
vi.mock('@/features/jobs/hooks/useSendShootGallery', () => ({ useGalleryLastSent: () => new Map() }));
vi.mock('@/features/quotes/hooks/useQuotes', () => ({ useQuoteList: () => ({ data: state.quotes, isLoading: false }) }));
vi.mock('@/features/jobs/lib/projectSummary', async (orig) => ({
  ...(await orig<typeof import('@/features/jobs/lib/projectSummary')>()),
  useProjectRequests: () => ({ data: state.requests }),
}));

afterEach(() => cleanup());

const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

describe('Home: Needs you', () => {
  it('Home has the Needs you list and no setup cards', () => {
    render(<AdminPanel />);
    expect(screen.getByRole('heading', { name: 'pages.admin.needs_you.title' })).toBeInTheDocument();
    expect(screen.queryByText('settings.hub.page_title')).not.toBeInTheDocument();
    expect(screen.queryByText('pages.admin.setup.title')).not.toBeInTheDocument();
  });

  it('nothing waiting: says so', () => {
    render(<NeedsYouList />);
    expect(screen.getByText('pages.admin.needs_you.nothing')).toBeInTheDocument();
  });

  it('one line per kind of thing waiting, each a link', () => {
    state.on = new Set(['billing:quotes.generate']);
    state.shop = true;
    state.leads = [
      { id: 'l1', stage: 'new', converted_account_id: null, next_follow_up_at: null },
      { id: 'l2', stage: 'contacted', converted_account_id: null, next_follow_up_at: '2000-01-01' },
      { id: 'l3', stage: 'lost', converted_account_id: null, next_follow_up_at: '2000-01-01' },
    ];
    state.quotes = [{ id: 'q1', status: 'sent' }, { id: 'q2', status: 'accepted' }];
    state.jobs = [
      { engagement_id: 'e1', job_status: 'booked', booked_starts_at: soon, currency: 'ILS' },
      { engagement_id: 'e2', job_status: 'editing', booked_starts_at: null, currency: 'ILS' },
      { engagement_id: 'e3', job_status: 'cancelled', booked_starts_at: soon, currency: 'ILS' },
    ];
    state.orders = [{ id: 'o1', status: 'paid' }, { id: 'o2', status: 'delivered' }];
    state.requests = [{ engagement_id: 'e1', status: 'sent', amount_minor: 50000 }];
    render(<NeedsYouList />);
    expect(screen.getByRole('link', { name: /new_leads\(1\)/ })).toHaveAttribute('href', '/admin/leads');
    expect(screen.getByRole('link', { name: /follow_ups\(1\)/ })).toHaveAttribute('href', '/admin/leads');
    expect(screen.getByRole('link', { name: /quotes_waiting\(1\)/ })).toHaveAttribute('href', '/admin/projects/quotes');
    expect(screen.getByRole('link', { name: /coming_up\(1\)/ })).toHaveAttribute('href', '/admin/projects');
    expect(screen.getByRole('link', { name: /galleries_to_send\(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders_to_deliver\(1\)/ })).toHaveAttribute(
      'href',
      '/admin/shop/photos?tab=orders',
    );
    expect(screen.getByRole('link', { name: /money_owed\(1\)/ })).toBeInTheDocument();
  });

  it('class studios: enrolments to review and waiting for payment', () => {
    state.on = new Set();
    state.shop = false;
    state.projects = false;
    state.leads = [];
    render(<NeedsYouList enrolments={{ awaitingPayment: 2, toReview: 1 }} />);
    expect(screen.getByRole('link', { name: /enrolments_to_review\(1\)/ })).toHaveAttribute('href', '/admin/people');
    expect(screen.getByRole('link', { name: /enrolments_awaiting_payment\(2\)/ })).toBeInTheDocument();
  });

  it('features off: no quote, photo shop or shoot lines', () => {
    state.on = new Set();
    state.shop = false;
    state.projects = false;
    render(<NeedsYouList />);
    expect(screen.queryByText(/quotes_waiting/)).toBeNull();
    expect(screen.queryByText(/orders_to_deliver/)).toBeNull();
    expect(screen.queryByText(/coming_up/)).toBeNull();
    expect(screen.queryByText(/money_owed/)).toBeNull();
  });
});

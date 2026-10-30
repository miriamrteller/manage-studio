// @vitest-environment jsdom
/** Admin shoot page: Quote accepted → Contract signed → Deposit paid. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { JobBookingProgress } from '@/features/jobs/components/JobBookingProgress';
import type { JobRow } from '@/features/jobs/services/jobService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  quote: null as null | { accepted_at: string; accepted_result: Record<string, unknown> },
  requests: [] as Array<{ id: string; status: string; paid_at: string | null }>,
}));
vi.mock('@/features/quotes/services/quoteService', () => ({
  QuoteService: { acceptedForEngagement: async () => state.quote },
}));
vi.mock('@/features/jobs/hooks/useJobPaymentRequests', () => ({
  useJobPaymentRequests: () => ({ requests: state.requests }),
}));

const job = (over: Partial<JobRow> = {}) => ({
  engagement_id: 'e1', waiver_evidence_id: null, contract_signed_at: null, ...over,
}) as JobRow;

beforeEach(async () => {
  setTenant('photographer');
  await setLanguage('en');
  state.quote = { accepted_at: '2026-10-30T10:00:00Z', accepted_result: { deposit_minor: 30000, payment_request_ids: ['dep', 'bal'] } };
  state.requests = [{ id: 'dep', status: 'pending', paid_at: null }, { id: 'bal', status: 'pending', paid_at: null }];
});

describe('JobBookingProgress', () => {
  it('shows the three steps in order, waiting on the client', async () => {
    renderInApp(<JobBookingProgress job={job()} />);
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-step'))).toEqual(['quote_accepted', 'contract_signed', 'deposit_paid']);
    expect(items[0]).toHaveTextContent('Quote accepted');
    expect(items[0]).toHaveTextContent('Done 30 Oct 2026');
    expect(items[1]).toHaveTextContent('Waiting for the client');
    expect(items[2]).toHaveTextContent('Waiting for the client');
    expect(screen.getByRole('heading', { level: 2, name: 'Booking progress' })).toBeInTheDocument();
  });

  it('ticks off signing and the deposit as they complete', async () => {
    state.requests = [{ id: 'dep', status: 'paid', paid_at: '2026-10-31T09:00:00Z' }];
    renderInApp(<JobBookingProgress job={job({ waiver_evidence_id: 'ev', contract_signed_at: '2026-10-30T12:00:00Z' })} />);
    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-done'))).toEqual(['true', 'true', 'true']);
    expect(items[2]).toHaveTextContent('Done 31 Oct 2026');
  });

  it('renders nothing for a shoot not booked from a quote', async () => {
    state.quote = null;
    const { container } = renderInApp(<JobBookingProgress job={job()} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('section')).toBeNull();
  });

  it('Hebrew', async () => {
    await setLanguage('he');
    renderInApp(<JobBookingProgress job={job()} />);
    expect(await screen.findByText('התקדמות ההזמנה')).toBeInTheDocument();
    expect(screen.getByText('הצעת המחיר אושרה')).toBeInTheDocument();
  });
});

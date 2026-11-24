// @vitest-environment jsdom
/** Shoot page: "Cancel shoot" frees the time, stops pay links and tells the client. */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { CancelShootButton } from '@/features/jobs/components/CancelShootButton';
import type { JobRow } from '@/features/jobs/services/jobService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  cancelJob: vi.fn(),
  requests: [] as Array<{ id: string; status: string; amount_minor: number; currency: string }>,
}));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJob: () => ({ cancelJob: state.cancelJob, isCancelling: false }),
}));
vi.mock('@/features/jobs/hooks/useJobPaymentRequests', () => ({
  useJobPaymentRequests: () => ({ requests: state.requests }),
}));

const job = (over: Partial<JobRow> = {}) => ({
  engagement_id: 'e1', job_status: 'booked', client_name: 'Dana', client_email: 'client@example.com',
  currency: 'ILS', ...over,
}) as JobRow;

beforeAll(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

beforeEach(async () => {
  setTenant('photographer');
  await setLanguage('en');
  state.cancelJob = vi.fn(async () => ({ ok: true, cancelledRequests: 1, paidMinor: 0, emailed: true }));
  state.requests = [];
});

describe('CancelShootButton', () => {
  it('cancels and emails the client by default', async () => {
    renderInApp(<CancelShootButton job={job()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel shoot' }));
    expect(screen.getByRole('checkbox', { name: 'Email Dana to let them know' })).toBeChecked();
    const buttons = screen.getAllByRole('button', { name: 'Cancel shoot' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(state.cancelJob).toHaveBeenCalledWith(true));
    expect(await screen.findByText(/^Shoot cancelled/)).toHaveTextContent('Shoot cancelled. We emailed the client.');
  });

  it('shows money already paid and lets the studio skip the email', async () => {
    state.requests = [{ id: 'dep', status: 'paid', amount_minor: 30000, currency: 'ILS' }];
    renderInApp(<CancelShootButton job={job()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel shoot' }));
    expect(screen.getByText(/has already been paid/)).toHaveTextContent('300');
    fireEvent.click(screen.getByRole('checkbox'));
    const buttons = screen.getAllByRole('button', { name: 'Cancel shoot' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(state.cancelJob).toHaveBeenCalledWith(false));
  });

  it('is hidden once the shoot is cancelled', () => {
    renderInApp(<CancelShootButton job={job({ job_status: 'cancelled' })} />);
    expect(screen.queryByRole('button', { name: 'Cancel shoot' })).not.toBeInTheDocument();
  });
});

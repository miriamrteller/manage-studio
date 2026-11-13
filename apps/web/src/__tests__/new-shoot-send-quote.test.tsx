// @vitest-environment jsdom
/**
 * New shoot (owner, 13 Nov 2026: fewest steps): the main button creates the shoot and
 * emails the quote at once; "Create without a quote" keeps the old way.
 * Run: pnpm -C apps/web test new-shoot-send-quote
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  createJob: vi.fn(async (_input: unknown) => 'eng-5'),
  send: vi.fn(async (_input: unknown) => ({ quoteId: 'q-5', sent: true })),
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Lens Studio', currency: 'ILS', language_default: 'en' }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({
    labels: { offering: { singular: 'Package', plural: 'Packages' }, account: { singular: 'Client', plural: 'Clients' } },
  }),
}));
vi.mock('@/components/shared', () => ({ PersonSearchCombobox: () => null }));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobPackages: () => ({
    data: [{ id: 'p1', name: 'Family shoot', duration_mins: 60, price_minor: 90000, currency: 'ILS', location: null, is_public: true }],
  }),
  useJobs: () => ({ createJob: h.createJob, isCreating: false }),
}));
vi.mock('@/features/quotes/services/sendShootRequestQuote', () => ({ sendShootRequestQuote: h.send }));

import i18n from '@/i18n/i18n';
import { JobCreateForm } from '@/features/jobs/components/JobCreateForm';

function renderForm() {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/admin/jobs']}>
        <Routes>
          <Route path="/admin/jobs" element={<JobCreateForm prefill={{ clientMode: 'new' }} />} />
          <Route path="/admin/quotes/:id" element={<p>quote page</p>} />
          <Route path="/admin/jobs/:id" element={<p>shoot page</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
  fireEvent.change(screen.getByLabelText(/Client name/), { target: { value: 'Noa' } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('New shoot', () => {
  it('Create and send quote: the shoot is made and the quote emailed', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create and send quote' }));
    await waitFor(() => expect(screen.getByText('quote page')).toBeInTheDocument());
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ engagementId: 'eng-5', offeringId: 'p1', clientName: 'Noa' }));
  });

  it('Create without a quote opens the shoot, nothing sent', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create without a quote' }));
    await waitFor(() => expect(screen.getByText('shoot page')).toBeInTheDocument());
    expect(h.send).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
/**
 * Confirming a shoot request (owner, 13 Nov 2026): the shoot is booked on the
 * day asked for and the client is emailed the quote at once, at the package
 * price, to accept and pay the deposit. If it cannot be sent (no email), the
 * quote is saved and opens so the studio can send it another way.
 * Run: pnpm -C apps/web test confirm-shoot-request
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  convert: vi.fn(async (_input: unknown) => 'eng-9'),
  save: vi.fn(async (_draft: unknown) => 'q-1'),
  clientEmail: 'dana@example.test' as string | null,
  markSent: vi.fn(async () => undefined),
  sendQuoteEmail: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Lens Studio', currency: 'ILS', language_default: 'en' }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({ labels: { offering: { singular: 'Package', plural: 'Packages' } } }),
}));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobPackages: () => ({
    data: [{ id: 'p1', name: 'Family shoot', duration_mins: 60, price_minor: 90000, currency: 'ILS', location: null, is_public: true }],
  }),
  useConvertLead: () => ({ mutateAsync: h.convert, isPending: false }),
}));
vi.mock('@/features/quotes/services/quoteService', () => ({
  QuoteService: {
    packages: async () => [{ id: 'p1', name: 'Family shoot', price_minor: 90000 }],
    save: h.save,
    get: async (id: string) => ({
      id,
      client_email: h.clientEmail,
      lines: [{ offering_id: 'p1' }],
    }),
    automaticEmails: async () => ({ quote_sent: true }),
    markSent: h.markSent,
  },
}));
vi.mock('@/features/quotes/services/sendQuoteEmail', () => ({ sendQuoteEmail: h.sendQuoteEmail }));

import i18n from '@/i18n/i18n';
import { ConvertLeadPanel } from '@/features/jobs/components/ConvertLeadPanel';

function renderPanel() {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/admin/leads']}>
        <Routes>
          <Route
            path="/admin/leads"
            element={
              <ConvertLeadPanel leadId="l-1" leadName="Dana" defaultOfferingId="p1" eventDate="2026-12-04" confirming onClose={() => {}} />
            }
          />
          <Route path="/admin/projects/quotes/:id" element={<p>quote page</p>} />
          <Route path="/admin/projects/quotes/new" element={<p>quote editor</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  h.clientEmail = 'dana@example.test';
  vi.clearAllMocks();
});

describe('Confirm a shoot request', () => {
  it('books the shoot on that day and emails the quote at the package price', async () => {
    renderPanel();
    expect(screen.getByText(/emails the client the quote/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('quote page')).toBeInTheDocument());

    expect(h.convert).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 'l-1', offering_id: 'p1' }));
    const draft = h.save.mock.calls[0][0] as Record<string, unknown>;
    expect(draft).toMatchObject({ engagement_id: 'eng-9', shoot_date: '2026-12-04', deposit_percent: 30 });
    expect(draft.lines).toEqual([expect.objectContaining({ offering_id: 'p1', unit_price_minor: 90000 })]);
    expect(h.markSent).toHaveBeenCalledWith('q-1', 'email');
    expect(h.sendQuoteEmail).toHaveBeenCalledTimes(1);
  });

  it('no client email: the quote is saved, not sent, and opens for the studio', async () => {
    h.clientEmail = null;
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('quote page')).toBeInTheDocument());
    expect(h.sendQuoteEmail).not.toHaveBeenCalled();
    expect(h.markSent).not.toHaveBeenCalled();
  });

  it('if the quote cannot be made, the shoot stays booked and a new quote opens', async () => {
    h.save.mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('quote editor')).toBeInTheDocument());
    expect(h.convert).toHaveBeenCalledTimes(1);
  });
});

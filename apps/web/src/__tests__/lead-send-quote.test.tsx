// @vitest-environment jsdom
/**
 * "Send quote" on an enquiry (owner, 13 Nov 2026: fewest steps). The lead form
 * itself sends: the shoot is booked and the quote is emailed in one go, like
 * Confirm on a Book page request.
 * Run: pnpm -C apps/web test lead-send-quote
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  convert: vi.fn(async (_input: unknown) => 'eng-7'),
  send: vi.fn(async (_input: unknown) => ({ quoteId: 'q-7', sent: true })),
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Lens Studio', currency: 'ILS', language_default: 'en' }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({ labels: { offering: { singular: 'Package', plural: 'Packages' } } }),
}));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobPackages: () => ({
    data: [{ id: 'p1', name: 'Family shoot', duration_mins: 60, price_minor: 90000, currency: 'ILS', location: 'Park', is_public: true }],
  }),
  useConvertLead: () => ({ mutateAsync: h.convert, isPending: false }),
}));
vi.mock('@/features/quotes/services/sendShootRequestQuote', () => ({ sendShootRequestQuote: h.send }));

import i18n from '@/i18n/i18n';
import { ConvertLeadPanel, SendLeadQuoteButton } from '@/features/jobs/components/ConvertLeadPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Send quote on an enquiry', () => {
  it('books the shoot, emails the quote and opens it', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/leads']}>
          <Routes>
            <Route path="/admin/leads" element={<ConvertLeadPanel leadId="l-7" leadName="Noa" onClose={() => {}} />} />
            <Route path="/admin/quotes/:id" element={<p>quote page</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText(i18n.t('pages.crm.leads.send_quote_hint'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pages.crm.leads.send_quote') }));
    await waitFor(() => expect(screen.getByText('quote page')).toBeInTheDocument());
    expect(h.convert).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 'l-7', offering_id: 'p1', location: 'Park' }));
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ engagementId: 'eng-7', offeringId: 'p1', clientName: 'Noa' }));
  });
});

describe('Send quote button on a lead row', () => {
  it('sends in one click when the lead names a package', async () => {
    const onNeedsForm = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/leads']}>
          <Routes>
            <Route
              path="/admin/leads"
              element={<SendLeadQuoteButton leadId="l-8" leadName="Dana" offeringId="p1" eventDate="2026-12-04" location={null} onNeedsForm={onNeedsForm} />}
            />
            <Route path="/admin/quotes/:id" element={<p>quote page</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pages.crm.leads.send_quote') }));
    await waitFor(() => expect(screen.getByText('quote page')).toBeInTheDocument());
    expect(h.convert).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 'l-8', offering_id: 'p1', location: 'Park' }));
    expect(onNeedsForm).not.toHaveBeenCalled();
  });

  it('opens the form when the lead names no package', () => {
    const onNeedsForm = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SendLeadQuoteButton leadId="l-9" leadName="Dana" offeringId={null} eventDate={null} location={null} onNeedsForm={onNeedsForm} />
        </MemoryRouter>
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pages.crm.leads.send_quote') }));
    expect(onNeedsForm).toHaveBeenCalled();
    expect(h.convert).not.toHaveBeenCalled();
  });
});

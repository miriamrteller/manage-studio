// @vitest-environment jsdom
/**
 * Fewer steps, round two (owner, 13 Nov 2026): "Save and email quote" in one
 * click, "Open quote" once a project has a quote, and the photo shop's SmugMug
 * gallery offered as the project's gallery link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QuoteEditor } from '@/features/quotes/components/QuoteEditor';
import { ProjectQuoteButton } from '@/features/quotes/components/ProjectQuoteButton';
import { JobDetailsForm } from '@/features/jobs/components/JobDetailsForm';
import type { JobRow } from '@/features/jobs/services/jobService';
import type { QuoteDraft } from '@/features/quotes/lib/quoteSchemas';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  openQuote: null as { id: string; status: string } | null,
  shopWebUrl: null as string | null,
  updateDetails: vi.fn(),
}));

vi.mock('@/features/quotes/services/quoteService', () => ({
  QuoteService: { openForEngagement: vi.fn(async () => state.openQuote) },
}));
vi.mock('@/features/quotes/hooks/useQuotes', () => ({
  useQuotePackages: () => ({ data: [] }),
  useQuoteMutations: () => ({
    save: { mutate: (_d: unknown, o: { onSuccess: (id: string) => void }) => o.onSuccess('q9'), isPending: false, error: null },
  }),
}));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJob: () => ({ updateDetails: state.updateDetails, updateSchedule: vi.fn(), isUpdatingDetails: false, isUpdatingSchedule: false }),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', () => ({ usePhotoShopEnabled: () => true }));
vi.mock('@/features/jobs/services/photoShopService', () => ({
  PhotoShopService: { getShop: vi.fn(async () => ({ gallery_name: 'Pat family', gallery_web_url: state.shopWebUrl })) },
}));
vi.mock('@/features/jobs/components/JobGalleryLink', () => ({ JobGalleryReleaseBadge: () => null }));

const draft: QuoteDraft = {
  id: null,
  lead_id: '11111111-1111-4111-8111-111111111111',
  engagement_id: null,
  title: 'Family shoot',
  notes: null,
  shoot_date: null,
  valid_until: '2026-12-01',
  deposit_percent: 30,
  balance_max_installments: 1,
  send_contract_on_accept: false,
  lines: [{ offering_id: null, description: 'Family shoot', qty: 1, unit_price_minor: 100000, is_optional: false, is_selected: true, sort_order: 0 }],
} as unknown as QuoteDraft;

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    engagement_id: 'e1', job_status: 'booked', location: null, notes: null, lead_id: null,
    gallery_url: null, gallery_released_at: null, created_at: '2026-10-01T00:00:00Z', engagement_status: 'active',
    booked_starts_at: null, booked_ends_at: null, waiver_evidence_id: null, person_id: 'p1', client_name: 'Pat',
    client_email: 'pat@example.com', client_phone: null, offering_id: 'o1', package_name: 'Family', price_minor: 100000,
    currency: 'ILS', contract_signed_at: null, contract_pdf_pending: false, ...overrides,
  } as JobRow;
}

describe('fewer steps, round two', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.openQuote = null;
    state.shopWebUrl = null;
    state.updateDetails.mockReset();
  });

  it('saves and emails a quote in one click, or only saves', async () => {
    const onSaved = vi.fn();
    renderInApp(<QuoteEditor initial={draft} currency="ILS" editable canEmail onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save and email quote' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('q9', { email: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Save quote' }));
    await waitFor(() => expect(onSaved).toHaveBeenLastCalledWith('q9', { email: false }));
  });

  it('shows only Save when quote emails are off', () => {
    renderInApp(<QuoteEditor initial={draft} currency="ILS" editable onSaved={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save and email quote' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save quote' })).toBeTruthy();
  });

  it('opens the existing quote instead of starting a second one', async () => {
    state.openQuote = { id: 'q1', status: 'sent' };
    renderInApp(<ProjectQuoteButton engagementId="e1" />);
    const link = await screen.findByRole('link', { name: 'Open quote' });
    expect(link.getAttribute('href')).toBe('/admin/projects/quotes/q1');
  });

  it('offers Create quote when the project has none', async () => {
    renderInApp(<ProjectQuoteButton engagementId="e1" />);
    const link = await screen.findByRole('link', { name: 'Create quote' });
    expect(link.getAttribute('href')).toBe('/admin/projects/quotes/new?engagement=e1');
  });

  it('fills the gallery link from the photo shop gallery in one click', async () => {
    state.shopWebUrl = 'https://studio.smugmug.com/Pat-family';
    renderInApp(<JobDetailsForm job={job()} />);
    fireEvent.click(await screen.findByRole('button', { name: "Use the photo shop's SmugMug gallery" }));
    await waitFor(() =>
      expect(state.updateDetails).toHaveBeenCalledWith(expect.objectContaining({ gallery_url: 'https://studio.smugmug.com/Pat-family' })),
    );
    expect((screen.getByLabelText('Gallery link', { exact: false }) as HTMLInputElement).value).toBe('https://studio.smugmug.com/Pat-family');
  });

  it('does not offer the shop gallery when a link is already there', async () => {
    state.shopWebUrl = 'https://studio.smugmug.com/Pat-family';
    renderInApp(<JobDetailsForm job={job({ gallery_url: 'https://other.example/g' })} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: "Use the photo shop's SmugMug gallery" })).toBeNull();
  });

  it('tells the studio the status moves on by itself', () => {
    renderInApp(<JobDetailsForm job={job()} />);
    expect(screen.getByLabelText('Status').getAttribute('aria-describedby')).toBe('job-status-hint');
    expect(screen.getByText(/moves on by itself/)).toBeTruthy();
  });
});

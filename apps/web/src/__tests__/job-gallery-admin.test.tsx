// @vitest-environment jsdom
/**
 * Photographer admin: gallery link validation, the "Open gallery" button on
 * the shoot page, shoot page headings (no i18n object-as-string leaks) and
 * the stacked Shoots list on phones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { safeGalleryUrl } from '@/features/jobs/lib/galleryUrl';
import { JobDetail } from '@/features/jobs/components/JobDetail';
import { JobsList } from '@/features/jobs/components/JobsList';
import type { JobRow } from '@/features/jobs/services/jobService';
import { baseValue, renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({ job: null as JobRow | null, released: false }));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJob: () => ({
    job: state.job,
    isLoading: false,
    error: null,
    updateDetails: vi.fn(),
    updateSchedule: vi.fn(),
    isUpdatingDetails: false,
    isUpdatingSchedule: false,
  }),
  useJobs: () => ({ jobs: state.job ? [state.job] : [], isLoading: false, error: null }),
}));
vi.mock('@/features/jobs/hooks/useJobPaymentRequests', () => ({
  useJobGallery: () => ({
    gallery: { released: state.released, has_gallery: true, all_paid: state.released, released_by_admin: false, outstanding_minor: 0, gallery_url: null, engagement_id: 'e1' },
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/features/jobs/components/JobPaymentsPanel', () => ({ JobPaymentsPanel: () => <p>payments panel</p> }));
vi.mock('@/features/jobs/components/JobContractCard', () => ({ JobContractCard: () => <p>contract card</p> }));
vi.mock('@/features/jobs/components/JobCreateForm', () => ({ JobCreateForm: () => null }));
vi.mock('@/features/quotes/components/CreateQuoteButton', () => ({ CreateQuoteButton: () => null }));

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    engagement_id: 'e1',
    job_status: 'booked',
    location: 'Jaffa Port',
    notes: null,
    lead_id: null,
    gallery_url: 'https://gallery.example/pat',
    gallery_released_at: null,
    created_at: '2026-10-01T00:00:00Z',
    engagement_status: 'active',
    booked_starts_at: '2026-12-01T10:00:00Z',
    booked_ends_at: '2026-12-01T12:00:00Z',
    waiver_evidence_id: null,
    person_id: 'p1',
    client_name: 'Pat Client',
    client_email: 'pat@example.com',
    client_phone: null,
    offering_id: 'o1',
    package_name: 'Wedding Gold',
    price_minor: 500000,
    currency: 'ILS',
    contract_signed_at: null,
    ...overrides,
  };
}

describe('safeGalleryUrl', () => {
  it('accepts absolute http(s) links', () => {
    expect(safeGalleryUrl('https://pixieset.com/pat')).toBe('https://pixieset.com/pat');
    expect(safeGalleryUrl('  http://example.com/g?x=1 ')).toBe('http://example.com/g?x=1');
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'mailto:a@b.c',
    '//evil.example/x',
    '/relative/path',
    'example.com/gallery',
    'https://',
    '',
    '   ',
    null,
    undefined,
  ])('rejects %j', (value) => {
    expect(safeGalleryUrl(value)).toBeNull();
  });
});

describe('JobDetail (photographer admin shoot page)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.job = job();
    state.released = false;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('renders every section heading as a string (Payments heading fixed)', () => {
    renderInApp(<JobDetail engagementId="e1" />, { path: '/admin/jobs/:id', initialEntry: '/admin/jobs/e1' });
    const headings = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    expect(headings).toContain(baseValue('pages.jobs.payments.title'));
    for (const h of headings) expect(h).not.toMatch(/returned an object|\[object Object\]/);
    expect(document.body.textContent).not.toMatch(/returned an object/);
    const objectWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('returned an object'));
    expect(objectWarnings).toEqual([]);
  });

  it('Open gallery opens the saved link in a new tab, safely, and shows client visibility', () => {
    renderInApp(<JobDetail engagementId="e1" />, { path: '/admin/jobs/:id', initialEntry: '/admin/jobs/e1' });
    const link = screen.getByRole('link', { name: 'Open gallery' });
    expect(link).toHaveAttribute('href', 'https://gallery.example/pat');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Not visible to the client yet')).toBeInTheDocument();
  });

  it('shows "Visible to the client" once released', () => {
    state.released = true;
    renderInApp(<JobDetail engagementId="e1" />, { path: '/admin/jobs/:id', initialEntry: '/admin/jobs/e1' });
    expect(screen.getByText('Visible to the client')).toBeInTheDocument();
  });

  it('is disabled when empty and never links a javascript: URL', () => {
    state.job = job({ gallery_url: null });
    renderInApp(<JobDetail engagementId="e1" />, { path: '/admin/jobs/:id', initialEntry: '/admin/jobs/e1' });
    expect(screen.getByRole('button', { name: 'Open gallery' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open gallery' })).toBeNull();

    fireEvent.change(screen.getByLabelText(baseValue('pages.jobs.gallery_url')), {
      target: { value: 'javascript:alert(1)' },
    });
    expect(screen.getByRole('button', { name: 'Open gallery' })).toBeDisabled();
    expect(screen.getByText('Enter a full link starting with https://')).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('Hebrew labels', async () => {
    await setLanguage('he');
    renderInApp(<JobDetail engagementId="e1" />, { path: '/admin/jobs/:id', initialEntry: '/admin/jobs/e1' });
    expect(screen.getByRole('link', { name: 'פתיחת הגלריה' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toContain('תשלומים');
  });
});

describe('JobsList', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.job = job();
  });

  it('renders a stacked card per shoot for phones next to the sm+ table', () => {
    renderInApp(<JobsList />, { path: '/admin/jobs' });
    const cards = screen.getAllByRole('list').find((l) => l.className.includes('sm:hidden')) as HTMLElement;
    expect(cards).toBeTruthy();
    const card = within(cards).getByRole('listitem');
    expect(within(card).getByRole('link', { name: 'Pat Client' })).toHaveAttribute('href', '/admin/jobs/e1');
    expect(within(card).getByText('Wedding Gold')).toBeInTheDocument();
    expect(within(card).getByText('Jaffa Port')).toBeInTheDocument();
    expect(screen.getByRole('table').closest('div')?.className).toContain('hidden sm:block');
  });

  it('row gallery link: only for valid links', () => {
    const first = renderInApp(<JobsList />, { path: '/admin/jobs' });
    const links = screen.getAllByRole('link', { name: 'Open the gallery for Pat Client' });
    expect(links.length).toBe(2); // card + table row
    for (const l of links) expect(l).toHaveAttribute('rel', 'noopener noreferrer');
    first.unmount();

    state.job = job({ gallery_url: 'javascript:alert(1)' });
    renderInApp(<JobsList />, { path: '/admin/jobs' });
    expect(screen.queryByRole('link', { name: 'Open the gallery for Pat Client' })).toBeNull();
  });
});

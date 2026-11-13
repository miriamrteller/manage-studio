// @vitest-environment jsdom
/**
 * Leads page (its tabs are the menu's AreaTabs): the Leads tab shows the pipeline first (title, Add lead,
 * follow-ups, filters, table); getting leads (checklist, links/embed/QR,
 * forms, help) is the sibling Get leads tab. Admins can delete a lead after
 * confirming, except one that became a client or has a quote or job.
 * Run: pnpm -C apps/web test leads-tabs-delete.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  leads: [] as Array<Record<string, unknown>>,
  deleteLead: vi.fn(),
  deleteError: null as Error | null,
  counts: { quotes: 0, job_details: 0 } as Record<string, number>,
  deleteResult: { error: null as null | { code: string; message: string }, count: 1 },
}));
vi.mock('@/features/crm/hooks/useLeads', () => ({
  useLeads: () => ({
    leads: h.leads,
    isLoading: false,
    error: null,
    createLead: vi.fn(),
    isCreating: false,
    updateStage: vi.fn(),
    isUpdatingStage: false,
    enrolmentsById: new Map(),
    linkToEnrolment: vi.fn(),
    linkError: null,
    isLinking: false,
    dismissSuggestion: vi.fn(),
    deleteLead: h.deleteLead,
    deleteError: h.deleteError,
    isDeleting: false,
  }),
}));
vi.mock('@/features/crm/hooks/useNamedForms', () => ({ useNamedForms: () => ({ forms: [] }) }));
vi.mock('@/hooks/useEntityLabels', () => ({ useEntityLabels: () => ({ vertical: 'dance-studio' }) }));
vi.mock('@/features/crm/components/GetLeadsPanel', () => ({ GetLeadsPanel: () => <div data-testid="get-leads-panel" /> }));
vi.mock('@/features/crm/components/FirstLeadsChecklist', () => ({
  FirstLeadsChecklist: () => <div data-testid="first-leads" />,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        delete: () => q,
        then: (r: (v: unknown) => unknown) =>
          r(table === 'leads' ? h.deleteResult : { count: h.counts[table] ?? 0, error: null }),
      };
      return q;
    },
  },
}));

import i18n from '@/i18n/i18n';
import { LeadsList } from '@/features/crm/components/LeadsList';
import GetLeadsPage from '@/pages/GetLeadsPage';
import { LeadDeleteError, LeadService } from '@/features/crm/services/leadService';
import { navigationConfig, resolveActiveTab } from '@/components/Navigation/navigationConfig';

function lead(over: Record<string, unknown> = {}) {
  return {
    id: 'l-1',
    tenant_id: 't-1',
    name: 'Noa Levi',
    email: 'noa@example.test',
    phone: null,
    channel: 'website',
    interest: 'Ballet',
    note: null,
    stage: 'new',
    last_contacted_at: null,
    next_follow_up_at: null,
    converted_account_id: null,
    converted_engagement_id: null,
    suggested_engagement_id: null,
    answers: {},
    form_id: null,
    campaign: null,
    child_name: null,
    child_birth_date: null,
    event_date: null,
    offering_id: null,
    created_at: '2026-11-01T10:00:00Z',
    ...over,
  };
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/leads" element={<><LeadsList /><Where /></>} />
          <Route path="/admin/leads/get" element={<><GetLeadsPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.leads = [lead()];
  h.deleteError = null;
  h.counts = { quotes: 0, job_details: 0 };
  h.deleteResult = { error: null, count: 1 };
});
afterEach(async () => {
  vi.restoreAllMocks();
  h.deleteLead.mockReset();
  await i18n.changeLanguage('en');
});

describe('Leads | Get leads tabs', () => {
  it('the Leads tab starts with the pipeline; nothing about getting leads above it', () => {
    renderAt('/admin/leads');
    expect(screen.getByRole('button', { name: 'New lead' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('get-leads-panel')).toBeNull();
    expect(screen.queryByTestId('first-leads')).toBeNull();
  });

  it('the empty Leads tab points to Get leads', () => {
    h.leads = [];
    renderAt('/admin/leads');
    fireEvent.click(screen.getByRole('button', { name: 'Get leads' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/leads/get');
  });

  it('Get leads has the checklist, the links/embed/QR panel, forms and help', () => {
    renderAt('/admin/leads/get');
    expect(screen.getByTestId('first-leads')).toBeInTheDocument();
    expect(screen.getByTestId('get-leads-panel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forms/i })).toHaveAttribute('href', '/admin/leads/forms');
    expect(screen.getByRole('link', { name: /How leads work|help/i })).toHaveAttribute('href', '/admin/leads/help');
  });

  it('forms and help count as the Get leads tab', () => {
    const leadsTabs = navigationConfig.filter((item) => item.area === 'leads');
    const tab = (path: string) => resolveActiveTab(path, '', leadsTabs)?.path;
    expect(tab('/admin/leads')).toBe('/admin/leads');
    expect(tab('/admin/leads/get')).toBe('/admin/leads/get');
    expect(tab('/admin/leads/forms')).toBe('/admin/leads/get');
    expect(tab('/admin/leads/help')).toBe('/admin/leads/get');
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderAt('/admin/leads');
    expect(screen.getByRole('button', { name: 'מחיקת Noa Levi' })).toBeInTheDocument();
  });
});

describe('Delete lead', () => {
  it('asks first, then deletes', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt('/admin/leads');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Noa Levi' }));
    expect(confirm).toHaveBeenCalledWith("Delete this lead (Noa Levi)? This can't be undone.");
    expect(h.deleteLead).toHaveBeenCalledWith('l-1', expect.anything());
  });

  it('cancelling deletes nothing', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAt('/admin/leads');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Noa Levi' }));
    expect(h.deleteLead).not.toHaveBeenCalled();
  });

  it('a lead that became a client cannot be deleted, and says why', () => {
    h.leads = [lead({ converted_account_id: 'a-1' })];
    renderAt('/admin/leads');
    const button = screen.getByRole('button', { name: 'Delete Noa Levi' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("This lead became a client, so it can't be deleted.");
  });

  it('a lead with a quote or job: the reason is shown', () => {
    h.deleteError = new LeadDeleteError('has_quote_or_job');
    renderAt('/admin/leads');
    expect(screen.getByRole('alert')).toHaveTextContent('This lead has a quote or a job. Delete those first.');
  });
});

describe('LeadService.remove', () => {
  const tenant = { id: 't-1' } as never;

  it('deletes a lead with nothing attached', async () => {
    await expect(LeadService.remove(tenant, 'l-1')).resolves.toBeUndefined();
  });

  it('stops before deleting when a quote or job points at the lead', async () => {
    h.counts.quotes = 1;
    await expect(LeadService.remove(tenant, 'l-1')).rejects.toMatchObject({ reason: 'has_quote_or_job' });
  });

  it('a foreign-key refusal reads the same way', async () => {
    h.deleteResult = { error: { code: '23503', message: 'violates foreign key' }, count: 0 };
    await expect(LeadService.remove(tenant, 'l-1')).rejects.toMatchObject({ reason: 'has_quote_or_job' });
  });

  it('nothing deleted (not allowed or already gone) is reported', async () => {
    h.deleteResult = { error: null, count: 0 };
    await expect(LeadService.remove(tenant, 'l-1')).rejects.toMatchObject({ reason: 'not_deleted' });
  });
});

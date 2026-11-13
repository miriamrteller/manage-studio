// @vitest-environment jsdom
/**
 * The Shoots (jobs) page is photographer-only. A dance studio that lands on
 * /admin/projects (the ballet demo's start page did) gets its Students page, never
 * the photographer jobs list; photographers keep their Shoots page.
 * Run: pnpm -C apps/web test jobs-page-vertical-guard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import JobsPage from '@/pages/JobsPage';
import { renderInApp, setLanguage, setTenant, type FakeTenantKind } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobs: () => ({ jobs: [], isLoading: false, error: null }),
}));
vi.mock('@/features/jobs/components/JobCreateForm', () => ({ JobCreateForm: () => null }));

function renderJobs() {
  return renderInApp(<JobsPage />, {
    path: '/admin/projects',
    extraRoutes: { '/admin/people': <h1>Students page</h1> },
  });
}

beforeEach(async () => {
  await setLanguage('en');
});

describe('/admin/projects by studio type', () => {
  it.each<FakeTenantKind>(['dance', 'generic', 'none', 'beautician'])(
    '%s studio goes to its Students page, with no Shoots, quotes or contracts UI',
    (kind) => {
      setTenant(kind);
      renderJobs();
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/people');
      expect(screen.getByRole('heading', { name: 'Students page' })).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/shoot|quote|contract|gallery/i);
    },
  );

  it('photographer keeps the Shoots page (unchanged)', () => {
    setTenant('photographer');
    renderJobs();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/projects');
    expect(screen.queryByRole('heading', { name: 'Students page' })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent(/shoot/i);
  });
});

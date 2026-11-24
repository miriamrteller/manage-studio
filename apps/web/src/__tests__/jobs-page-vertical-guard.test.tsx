// @vitest-environment jsdom
/**
 * The jobs page follows the Projects feature (billing:quotes.generate), not the industry. A dance studio that lands on
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
// Projects on = the quotes feature (billing:quotes.generate). Photographers have it.
const features = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/hooks/useHasFeature', () => ({
  useHasFeature: () => ({ hasFeature: (key: string) => features.on.has(key), isLoading: false }),
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
  features.on = new Set();
});

describe('/admin/projects by studio type', () => {
  it('any studio with projects switched on keeps the page (the feature set decides, not the industry)', () => {
    setTenant('generic');
    features.on = new Set(['billing:quotes.generate']);
    renderJobs();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/projects');
  });

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
    features.on = new Set(['billing:quotes.generate']);
    renderJobs();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/projects');
    expect(screen.queryByRole('heading', { name: 'Students page' })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent(/shoot/i);
  });
});

// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AdminPanel } from '@/components/Dashboard/AdminPanel';

/**
 * Owner, 13 Nov 2026: "why are there seasons in photographers?" and "they need to
 * be controlled by the feature set". Levels and Seasons follow "Levels, terms and
 * sessions" (offerings:structure.configure); Billing accounts follow family accounts.
 */
const state = vi.hoisted(() => ({ on: new Set<string>() }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()] as const,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({
    vertical: 'generic',
    modules: { categories: true, scheduling: true },
    labels: {
      category: { plural: 'LEVELS_CARD' },
      season: { plural: 'SEASONS_CARD' },
      offering: { plural: 'Packages' },
    },
  }),
}));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (key: string) => state.on.has(key), isLoading: false }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1' }) }));
vi.mock('@/lib/tenantProviderRouting', () => ({ getBundledPaymentProviderSlug: () => null }));
vi.mock('@/components/Dashboard/useAdminDashboard', () => ({
  useAdminDashboard: () => ({ overview: null, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/features/admin-dashboard/components/AdminOverviewSection', () => ({ AdminOverviewSection: () => null }));
vi.mock('@/features/finance/components/FinanceHealthCard', () => ({ FinanceHealthCard: () => null }));
vi.mock('@/features/setup-guide', () => ({
  CelebrationBanner: () => null,
  SetupGuideCard: () => null,
  useCelebrations: () => ({ active: null, fewer: false, dismiss: vi.fn(), setFewer: vi.fn() }),
  useSetupGuide: () => ({ visible: false, isLoading: false, reopen: vi.fn(), progress: { complete: true }, facts: {} }),
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

afterEach(() => cleanup());

describe('setup page cards', () => {
  it('with those features off (a photographer studio) there is no Levels, Seasons or Billing accounts card', () => {
    state.on = new Set();
    render(<AdminPanel />);
    expect(screen.queryByText('SEASONS_CARD')).not.toBeInTheDocument();
    expect(screen.queryByText('LEVELS_CARD')).not.toBeInTheDocument();
    expect(screen.queryByText('pages.billing.title')).not.toBeInTheDocument();
    expect(screen.getByText('settings.hub.page_title')).toBeInTheDocument();
  });

  it('switching the features on brings the cards back', () => {
    state.on = new Set(['offerings:structure.configure', 'people:families.manage']);
    render(<AdminPanel />);
    expect(screen.getByText('SEASONS_CARD')).toBeInTheDocument();
    expect(screen.getByText('LEVELS_CARD')).toBeInTheDocument();
    expect(screen.getByText('pages.billing.title')).toBeInTheDocument();
  });
});

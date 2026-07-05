// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinanceHub } from '@/features/finance-admin/components/FinanceHub';
import {
  navigationConfig,
  canAccessRoute,
} from '@/components/Navigation/navigationConfig';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()] as const,
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

describe('finance-admin shell (F1)', () => {
  it('FinanceHub renders title and navigation actions', () => {
    renderWithClient(<FinanceHub />);
    expect(screen.getByText('finance.hub.title')).toBeInTheDocument();
    expect(screen.getByText('finance.hub.card_payments')).toBeInTheDocument();
    expect(screen.getByText('finance.hub.card_expenses')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2);
  });

  it('includes finance nav item for tenant_admin', () => {
    const financeItem = navigationConfig.find((item) => item.path === '/admin/finance');
    expect(financeItem).toBeDefined();
    expect(financeItem?.labelKey).toBe('finance.hub.title');
    expect(canAccessRoute(['tenant_admin'], financeItem!.requiredRoles)).toBe(true);
    expect(canAccessRoute(['parent'], financeItem!.requiredRoles)).toBe(false);
  });
});

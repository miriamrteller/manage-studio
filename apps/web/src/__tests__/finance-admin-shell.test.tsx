// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FinanceHub } from '@/features/finance-admin/components/FinanceHub';
import {
  navigationConfig,
  canAccessRoute,
} from '@/components/Navigation/navigationConfig';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => cleanup());

describe('finance-admin shell (F1)', () => {
  it('FinanceHub renders title and navigation actions', () => {
    render(<FinanceHub />);
    expect(screen.getByText('finance.hub.title')).toBeInTheDocument();
    expect(screen.getByText('finance.hub.card_payments')).toBeInTheDocument();
    expect(screen.getByText('finance.hub.card_expenses')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2);
  });

  it('includes finance nav item for tenant_admin', () => {
    const financeItem = navigationConfig.find((item) => item.path === '/admin/finance');
    expect(financeItem).toBeDefined();
    expect(financeItem?.labelKey).toBe('nav.finance');
    expect(canAccessRoute(['tenant_admin'], financeItem!.requiredRoles)).toBe(true);
    expect(canAccessRoute(['parent'], financeItem!.requiredRoles)).toBe(false);
  });
});

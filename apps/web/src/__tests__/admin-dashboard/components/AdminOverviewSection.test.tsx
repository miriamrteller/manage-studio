import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminOverviewSection } from '@/features/admin-dashboard/components/AdminOverviewSection';
import { NoActiveSeasonError } from '@/features/admin-dashboard/services/adminDashboardService';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/features/admin-dashboard/components/OverviewStatsGrid', () => ({
  OverviewStatsGrid: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="stats-grid" data-loading={String(isLoading)} />
  ),
}));

vi.mock('@/features/admin-dashboard/components/QuickActionsRow', () => ({
  QuickActionsRow: () => <div data-testid="quick-actions" />,
}));

vi.mock('@/features/admin-dashboard/components/TodaysClassesTable', () => ({
  TodaysClassesTable: () => <div data-testid="classes-table" />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

describe('AdminOverviewSection', () => {
  const baseProps = {
    overview: undefined,
    isLoading: false,
    error: null,
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders NoActiveSeasonError UI with blue banner', () => {
    render(<AdminOverviewSection {...baseProps} error={new NoActiveSeasonError()} />);
    expect(
      screen.getByText('pages.admin.overview.no_active_season'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('stats-grid')).not.toBeInTheDocument();
  });

  it('shows go-to-seasons button for NoActiveSeasonError', () => {
    render(<AdminOverviewSection {...baseProps} error={new NoActiveSeasonError()} />);
    expect(
      screen.getByText('pages.admin.overview.go_to_seasons'),
    ).toBeInTheDocument();
  });

  it('renders generic error with retry button', () => {
    render(<AdminOverviewSection {...baseProps} error={new Error('boom')} />);
    expect(screen.getByText('errors.dashboard_load_failed')).toBeInTheDocument();
    expect(screen.getByText('common.try_again')).toBeInTheDocument();
  });

  it('retry button calls onRefresh', () => {
    const onRefresh = vi.fn();
    render(
      <AdminOverviewSection {...baseProps} error={new Error('boom')} onRefresh={onRefresh} />,
    );
    fireEvent.click(screen.getByText('common.try_again'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders stats grid, quick actions, and classes table on happy path', () => {
    render(<AdminOverviewSection {...baseProps} error={null} />);
    expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('classes-table')).toBeInTheDocument();
  });

  it('passes isLoading=true to stats grid when loading', () => {
    render(<AdminOverviewSection {...baseProps} isLoading={true} />);
    const grid = screen.getByTestId('stats-grid');
    expect(grid).toHaveAttribute('data-loading', 'true');
  });
});

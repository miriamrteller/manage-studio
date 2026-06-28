import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverviewStatsGrid } from '@/features/admin-dashboard/components/OverviewStatsGrid';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const defaultProps = {
  termEnrolments: 0,
  outstandingPayments: 0,
  adminReviewCount: 0,
  revenueMTD: 0,
  isLoading: false,
};

describe('OverviewStatsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 4 skeleton placeholders when isLoading=true', () => {
    render(<OverviewStatsGrid {...defaultProps} isLoading={true} />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4);
  });

  it('renders 4 clickable stat cards when not loading', () => {
    render(<OverviewStatsGrid {...defaultProps} isLoading={false} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('formats revenueMTD from minor units correctly (234000 → 2,340)', () => {
    render(
      <OverviewStatsGrid
        {...defaultProps}
        revenueMTD={234000}
        currencyCode="ILS"
      />,
    );
    // The formatted value will contain '2,340' (minor / 100)
    expect(screen.getByText(/2,340/)).toBeInTheDocument();
  });

  it('clicking a stat card triggers navigation', () => {
    render(<OverviewStatsGrid {...defaultProps} isLoading={false} />);
    const cards = screen.getAllByRole('button');
    fireEvent.click(cards[0]);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('Enter key on a stat card triggers navigation', () => {
    render(<OverviewStatsGrid {...defaultProps} isLoading={false} />);
    const cards = screen.getAllByRole('button');
    fireEvent.keyDown(cards[0], { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassTableRow } from '@/features/admin-dashboard/components/ClassTableRow';

vi.mock('@/features/admin-dashboard/components/OccupancyBar', () => ({
  OccupancyBar: () => <div data-testid="occupancy-bar" />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

const mockClass = {
  id: 'cls-1',
  name: 'Morning Yoga',
  start_time: '09:30:00',
  end_time: '10:30:00',
  location: 'Studio A',
  max_capacity: 12,
  enrolled_count: 8,
  waitlist_count: 2,
  staff_name: 'Sarah',
};

describe('ClassTableRow', () => {
  it('displays HH:MM (slices seconds off start_time)', () => {
    render(
      <table>
        <tbody>
          <ClassTableRow class={mockClass} />
        </tbody>
      </table>,
    );
    expect(screen.getByText('09:30')).toBeInTheDocument();
  });

  it('renders waitlist badge using i18n key (not hardcoded English)', () => {
    render(
      <table>
        <tbody>
          <ClassTableRow class={mockClass} showWaitlist={true} />
        </tbody>
      </table>,
    );
    // Confirms t('pages.admin.overview.waitlist_count', ...) is called, not hardcoded 'waiting'
    expect(
      screen.getByText(/pages\.admin\.overview\.waitlist_count/),
    ).toBeInTheDocument();
  });

  it('does not render waitlist badge when showWaitlist=false', () => {
    render(
      <table>
        <tbody>
          <ClassTableRow class={mockClass} showWaitlist={false} />
        </tbody>
      </table>,
    );
    expect(
      screen.queryByText(/pages\.admin\.overview\.waitlist_count/),
    ).not.toBeInTheDocument();
  });

  it('calls onClick with class id when row is clicked', () => {
    const handleClick = vi.fn();
    render(
      <table>
        <tbody>
          <ClassTableRow class={mockClass} onClick={handleClick} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByText('Morning Yoga'));
    expect(handleClick).toHaveBeenCalledWith('cls-1');
  });

  it('renders OccupancyBar', () => {
    render(
      <table>
        <tbody>
          <ClassTableRow class={mockClass} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('occupancy-bar')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodaysClassesTable } from '@/features/admin-dashboard/components/TodaysClassesTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/features/admin-dashboard/components/ClassTableRow', () => ({
  ClassTableRow: ({
    class: cls,
    onClick,
  }: {
    class: { id: string; name: string };
    onClick?: (id: string) => void;
  }) => (
    <tr
      data-testid="class-row"
      data-id={cls.id}
      onClick={() => onClick?.(cls.id)}
    >
      <td>{cls.name}</td>
    </tr>
  ),
}));

const mockClasses = [
  {
    id: 'cls-1',
    name: 'Yoga',
    start_time: '09:00:00',
    end_time: '10:00:00',
    location: null,
    max_capacity: 10,
    enrolled_count: 5,
    waitlist_count: 0,
    staff_name: null,
  },
  {
    id: 'cls-2',
    name: 'Pilates',
    start_time: '18:00:00',
    end_time: '19:00:00',
    location: 'Studio B',
    max_capacity: 15,
    enrolled_count: 12,
    waitlist_count: 3,
    staff_name: 'Jane',
  },
];

describe('TodaysClassesTable', () => {
  it('renders skeleton rows in loading state', () => {
    render(<TodaysClassesTable classes={[]} isLoading={true} />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays no_classes_today message when classes is empty and not loading', () => {
    render(<TodaysClassesTable classes={[]} isLoading={false} />);
    expect(
      screen.getByText('pages.admin.overview.no_classes_today'),
    ).toBeInTheDocument();
  });

  it('renders one ClassTableRow per class', () => {
    render(<TodaysClassesTable classes={mockClasses} isLoading={false} />);
    expect(screen.getAllByTestId('class-row')).toHaveLength(2);
  });

  it('calls onClassClick with correct classId when row is clicked', () => {
    const onClassClick = vi.fn();
    render(
      <TodaysClassesTable
        classes={mockClasses}
        isLoading={false}
        onClassClick={onClassClick}
      />,
    );
    fireEvent.click(screen.getAllByTestId('class-row')[0]);
    expect(onClassClick).toHaveBeenCalledWith('cls-1');
  });
});

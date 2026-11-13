import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const registerProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/features/attendance/components/ClassRegister', () => ({
  ClassRegister: (props: Record<string, unknown>) => {
    registerProps.push(props);
    return <div data-testid="register">{String(props.className)}</div>;
  },
}));

import { TodaysClassesTable } from '@/features/admin-dashboard/components/TodaysClassesTable';
import { lastSessionDate } from '@/features/attendance/service';

const cls = {
  id: 'cls-1',
  name: 'Ballet 1',
  start_time: '16:00:00',
  end_time: '17:00:00',
  location: null,
  max_capacity: 10,
  enrolled_count: 6,
  waitlist_count: 0,
  staff_name: null,
};

describe("Today's classes: the register opens in one tap, on today's date", () => {
  it('Register opens it under the row without opening the class', () => {
    const onClassClick = vi.fn();
    render(<TodaysClassesTable classes={[cls] as never} isLoading={false} onClassClick={onClassClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'attendance.register.button' }));
    expect(screen.getByTestId('register').textContent).toBe('Ballet 1');
    expect(onClassClick).not.toHaveBeenCalled();
    expect(registerProps.at(-1)).toMatchObject({ offeringId: 'cls-1', isAdmin: true, initialDate: lastSessionDate(null) });
  });
});

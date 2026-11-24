// @vitest-environment jsdom
/**
 * Classes → Register: mark each enrolled student here or not here, tap again to clear,
 * mark the rest as here, and the default date (today, or the last day the class ran).
 * Run: pnpm -C apps/web test class-register.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ClassRegister } from '@/features/attendance/components/ClassRegister';
import { lastSessionDate } from '@/features/attendance/service';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/features/class-cards/hooks/useClassCardsEnabled', () => ({ useClassCardsEnabled: () => false }));

const svc = vi.hoisted(() => ({ calls: [] as Array<{ ids: string[]; attended: boolean | null }> }));

vi.mock('@/features/attendance/service', async (orig) => {
  const actual = await orig<typeof import('@/features/attendance/service')>();
  return {
    ...actual,
    fetchClassRegister: async () => ({
      runs: true,
      students: [
        { person_id: 'p1', name: 'Student One', enrolled: true, attended: true },
        { person_id: 'p2', name: 'Student Two', enrolled: true, attended: null },
        { person_id: 'p3', name: 'Student Three', enrolled: true, attended: null },
        { person_id: 'p4', name: 'Student Four', enrolled: false, attended: false },
      ],
    }),
    setClassAttendance: async (_o: string, _d: string, ids: string[], attended: boolean | null) =>
      void svc.calls.push({ ids, attended }),
  };
});

beforeEach(async () => {
  svc.calls = [];
  setTenant('dance');
  await setLanguage('en');
});

describe('Class register', () => {
  it('marks, clears and marks the rest as here', async () => {
    renderInApp(<ClassRegister offeringId="o1" className="Ballet" dayOfWeek={1} isAdmin initialDate="2026-11-09" />);
    expect(await screen.findByText('1 here · 1 not here · 2 not marked')).toBeInTheDocument();
    expect(screen.getByText('No longer in this class')).toBeInTheDocument();

    const one = screen.getByRole('group', { name: 'Attendance for Student One' });
    fireEvent.click(one.querySelector('button[aria-pressed="true"]')!);
    await waitFor(() => expect(svc.calls.at(-1)).toEqual({ ids: ['p1'], attended: null }));

    const two = screen.getByRole('group', { name: 'Attendance for Student Two' });
    fireEvent.click(two.querySelectorAll('button')[1]);
    await waitFor(() => expect(svc.calls.at(-1)).toEqual({ ids: ['p2'], attended: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Mark the rest as here' }));
    await waitFor(() => expect(svc.calls.at(-1)).toEqual({ ids: ['p2', 'p3'], attended: true }));
  });

  it('shows the Hebrew register', async () => {
    await setLanguage('he');
    renderInApp(<ClassRegister offeringId="o1" className="Ballet" dayOfWeek={1} isAdmin initialDate="2026-11-09" />);
    expect(await screen.findByRole('button', { name: 'סימון כל השאר כנוכחים' })).toBeInTheDocument();
  });

  it('starts on today, or the last day the class ran', () => {
    const wed = new Date('2026-11-11T10:00:00Z');
    expect(lastSessionDate(3, wed)).toBe('2026-11-11');
    expect(lastSessionDate(1, wed)).toBe('2026-11-09');
    expect(lastSessionDate(4, wed)).toBe('2026-11-05');
    expect(lastSessionDate(null, wed)).toBe('2026-11-11');
  });
});

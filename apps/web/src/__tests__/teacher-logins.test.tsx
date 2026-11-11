// @vitest-environment jsdom
/**
 * Teacher logins: the admin's Teachers page, the teacher's "My classes" page, the menu
 * and the after-sign-in landing page for a teacher. Fakes only (the database rules are
 * tested in supabase/tests/teacher-logins).
 * Run: pnpm -C apps/web test teacher-logins.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', name: 'Harbour Studio' }) }));
vi.mock('@/services/base.service', () => ({
  BaseService: class {
    static async withRetry<T>(fn: () => Promise<T>) { return fn(); }
    static async logAudit() {}
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${String(opts.count)}` : opts && 'name' in opts ? `${key}:${String(opts.name)}` : key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/features/attendance/components/ClassRegister', () => ({
  ClassRegister: ({ className }: { className: string }) => <div data-testid="register">{className}</div>,
}));

import { buildNavSections, navigationConfig } from '@/components/Navigation/navigationConfig';
import { hasTeacherRole } from '@/lib/teacherRoles';
import { teacherStatus, teacherSignInUrl } from '@/features/teachers/components/TeachersList';
import { MyClasses } from '@/features/teachers/components/MyClasses';
import { TeacherService, toTeacherInput } from '@/features/teachers/service';
import { StaffSchema } from '@shared/schemas';

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const cls = (over: Record<string, unknown>) => ({
  id: 'o1',
  name: 'Beginners',
  day_of_week: 1,
  start_time: '16:00:00',
  end_time: '17:00:00',
  location: null,
  status: 'active',
  season_name: 'Autumn',
  teacher_name: 'Noa',
  mine: true,
  enrolled: 3,
  ...over,
});

describe('menu', () => {
  const paths = (roles: string[]) =>
    buildNavSections(navigationConfig, roles).flatMap((s) => s.items.map((i) => i.path));

  it('a teacher gets My classes and no admin pages', () => {
    const p = paths(['account_holder', 'staff']);
    expect(p).toContain('/teach');
    expect(p).not.toContain('/admin/setup/teachers');
    expect(p).not.toContain('/admin/students');
  });

  it('an admin gets the Teachers page, not My classes', () => {
    const p = paths(['tenant_admin']);
    expect(p).toContain('/admin/setup/teachers');
    expect(p).not.toContain('/teach');
  });

  it('the teacher role is "staff"', () => {
    expect(hasTeacherRole(['staff'])).toBe(true);
    expect(hasTeacherRole(['teacher'])).toBe(false);
    expect(hasTeacherRole(undefined)).toBe(false);
  });
});

describe('Teachers page helpers', () => {
  it('shows whether a teacher has signed in', () => {
    expect(teacherStatus({ email: 'a@x.test', user_profile_id: 'u1' })).toBe('linked');
    expect(teacherStatus({ email: 'a@x.test', user_profile_id: null })).toBe('waiting');
    expect(teacherStatus({ email: null, user_profile_id: null })).toBe('no_email');
  });

  it('the sign-in link is the studio login page', () => {
    expect(teacherSignInUrl('https://harbour.opalswift.com')).toBe('https://harbour.opalswift.com/login');
  });

  it('saves blank email and phone as empty, and never sends the login link', () => {
    expect(toTeacherInput({ name: ' Noa ', email: '  ', phone: '' })).toEqual({ name: 'Noa', email: null, phone: null });
    const withLink = toTeacherInput({ name: 'Noa', email: 'noa@x.test', user_profile_id: 'u1' } as never);
    expect(withLink).not.toHaveProperty('user_profile_id');
  });

  it('reads staff rows as the database stores them', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      user_profile_id: null,
      name: 'Noa',
      email: null,
      phone: null,
      contract_type: 'hourly',
      hourly_rate_minor: null,
      created_at: '2026-11-11T00:00:00Z',
    };
    expect(StaffSchema.parse(row).name).toBe('Noa');
  });
});

describe('My classes', () => {
  it('lists all classes, own first, with who teaches the others', async () => {
    rpc.mockResolvedValue({
      data: {
        teacher_names: ['Noa'],
        own_classes_only: false,
        classes: [cls({}), cls({ id: 'o2', name: 'Advanced', mine: false, teacher_name: 'Dan', enrolled: 0 })],
      },
      error: null,
    });
    wrap(<MyClasses />);
    expect(await screen.findByText('Beginners')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('get_my_teaching');
    expect(screen.getByText('my_classes.intro_all')).toBeTruthy();
    expect(screen.getAllByTestId('my-class-mine')).toHaveLength(1);
    expect(screen.getByText(/my_classes.taught_by:Dan/)).toBeTruthy();
    expect(screen.getByText(/my_classes.enrolled:3/)).toBeTruthy();
  });

  it('opens the register for a class', async () => {
    rpc.mockResolvedValue({ data: { teacher_names: ['Noa'], own_classes_only: false, classes: [cls({})] }, error: null });
    wrap(<MyClasses />);
    const button = await screen.findByTestId('my-class-register');
    expect(screen.queryByTestId('register')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId('register').textContent).toBe('Beginners');
  });

  it('says when the studio shows teachers only their own classes', async () => {
    rpc.mockResolvedValue({ data: { teacher_names: ['Noa'], own_classes_only: true, classes: [cls({})] }, error: null });
    wrap(<MyClasses />);
    expect(await screen.findByText('my_classes.intro_own')).toBeTruthy();
  });

  it('shows a friendly empty state', async () => {
    rpc.mockResolvedValue({ data: { teacher_names: ['Noa'], own_classes_only: false, classes: [] }, error: null });
    wrap(<MyClasses />);
    expect(await screen.findByText('my_classes.empty_title')).toBeTruthy();
  });

  it('reads the classes through get_my_teaching', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(TeacherService.getMyTeaching()).resolves.toEqual({ teacher_names: [], own_classes_only: false, classes: [] });
  });
});

// @vitest-environment jsdom
/**
 * Redirect loop after enrolling from /classes (card AND pay-at-the-studio studios):
 * EnrolPage stored the intent, nothing cleared it on success, and /dashboard forwarded it
 * back to /enrol, where EnrolPage stored it again, for the whole browser session.
 * Scenario under test: enrol from /classes, finish, then open /dashboard twice; both
 * visits must land on the parent portal.
 * Run: pnpm -C apps/web test enrolment-intent-loop.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import EnrolPage from '../pages/EnrolPage';
import DashboardRedirectPage from '../pages/DashboardRedirectPage';
import { OfflinePaymentNotice } from '../features/enrolment/components/OfflinePaymentNotice';

const parent = { id: 'u-1', role: ['account_holder'] };
const { stepperProps } = vi.hoisted(() => ({ stepperProps: { current: null as null | { onSuccess?: (e: unknown) => void } } }));

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: parent, isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u-1' } }, isLoading: false }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenantQuery: () => ({ tenant: { id: 't-1' }, isLoading: false }), useTenant: () => ({ id: 't-1' }) }));
vi.mock('@/hooks/useEntityLabels', () => ({ useEntityLabels: () => ({ vertical: 'dance-studio' }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('@/features/enrolment/lib/enrolmentResumeState', () => ({
  loadEnrolmentResume: vi.fn(), clearEnrolmentResume: vi.fn(),
}));
// The stepper itself is not under test: expose its onSuccess so the test can finish the enrolment.
vi.mock('@/features/enrolment/components', () => ({
  EnrolmentStepper: (props: { onSuccess?: (e: unknown) => void }) => {
    stepperProps.current = props;
    return <div data-testid="stepper" />;
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }));

let lastPath = '';
function PathSpy() {
  lastPath = useLocation().pathname;
  return null;
}

function app(initial: { pathname: string; state?: unknown }, extra?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <PathSpy />
      <Routes>
        <Route path="/enrol" element={<EnrolPage />} />
        <Route path="/dashboard" element={<DashboardRedirectPage />} />
        <Route path="/dashboard/portal" element={<div>portal</div>} />
        <Route path="/offline-finish" element={<>{extra}</>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fromClasses = { classId: 'c-1', seasonId: 's-1' };

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  stepperProps.current = null;
});

async function visitDashboardTwice() {
  for (let i = 0; i < 2; i++) {
    app({ pathname: '/dashboard' });
    await waitFor(() => expect(lastPath).toBe('/dashboard/portal'));
    cleanup();
  }
}

describe('no /dashboard → /enrol loop after enrolling from /classes', () => {
  it('card studio: after checkout success both /dashboard visits land on the portal', async () => {
    app({ pathname: '/enrol', state: fromClasses });
    expect(sessionStorage.getItem('enrollmentIntent')).not.toBeNull(); // stored for the sign-in round trip
    await act(async () => {
      await stepperProps.current?.onSuccess?.({ id: 'eng-1', person_id: 'p-1', offering_id: 'c-1' });
    });
    await waitFor(() => expect(lastPath).toBe('/dashboard/portal')); // card success redirect unchanged
    expect(sessionStorage.getItem('enrollmentIntent')).toBeNull();
    cleanup();
    await visitDashboardTwice();
  });

  it('pay-at-the-studio studio: after the offline finish both /dashboard visits land on the portal', async () => {
    app({ pathname: '/enrol', state: fromClasses });
    cleanup();
    app({ pathname: '/offline-finish' }, <OfflinePaymentNotice />);
    expect(sessionStorage.getItem('enrollmentIntent')).toBeNull();
    cleanup();
    await visitDashboardTwice();
  });

  it('an intent forwarded by /dashboard is used once, not stored again', async () => {
    // e.g. after signing in mid-enrolment: the stored intent sends the parent to /enrol once…
    sessionStorage.setItem('enrollmentIntent', JSON.stringify(fromClasses));
    app({ pathname: '/dashboard' });
    await waitFor(() => expect(lastPath).toBe('/enrol'));
    // …and EnrolPage does not put it back, so the next /dashboard visit is the portal.
    expect(sessionStorage.getItem('enrollmentIntent')).toBeNull();
    cleanup();
    app({ pathname: '/dashboard' });
    await waitFor(() => expect(lastPath).toBe('/dashboard/portal'));
  });
});

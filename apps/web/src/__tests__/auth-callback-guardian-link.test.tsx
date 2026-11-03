// @vitest-environment jsdom
/**
 * Every sign-in through the email link asks the database to connect the login to a
 * family account that carries its verified email (link_my_guardian_accounts), then
 * continues to the dashboard. A failure of that call never blocks sign-in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  order: [] as string[],
  linkFails: false,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1', name: 'Creative Ballet' }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u1' } }, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { id: 'u1', role: ['account_holder'] },
    isLoading: false,
    isProfileChecked: true,
  }),
}));
vi.mock('@/lib/authCallback', () => ({
  captureAuthCallbackUrl: () => ({ search: '', hash: '' }),
  clearAuthCallbackUrl: () => undefined,
  establishSessionFromAuthCallback: async () => ({ ok: true }),
}));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: async () => undefined } }));
vi.mock('@/features/enrolment/linkAuthUser', () => ({
  linkGuardianForEngagement: vi.fn(),
  linkMyGuardianAccounts: vi.fn(async () => {
    h.order.push('link');
    if (h.linkFails) throw new Error('rpc down');
    return 1;
  }),
}));

import AuthCallbackPage from '@/pages/AuthCallbackPage';

function Dashboard() {
  h.order.push('dashboard');
  return <div>dashboard page</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.order = [];
  h.linkFails = false;
  sessionStorage.clear();
});

describe('AuthCallbackPage family link', () => {
  it('links the family account first, then goes to the dashboard', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('dashboard page')).toBeTruthy());
    expect(h.order[0]).toBe('link');
    expect(h.order).toContain('dashboard');
    expect(h.order.indexOf('link')).toBeLessThan(h.order.indexOf('dashboard'));
  });

  it('still signs the parent in when the link call fails', async () => {
    h.linkFails = true;
    renderPage();
    await waitFor(() => expect(screen.getByText('dashboard page')).toBeTruthy());
    expect(h.order).toContain('link');
  });
});

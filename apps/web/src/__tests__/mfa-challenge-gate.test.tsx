// @vitest-environment jsdom
/**
 * MfaChallengeGate — asks for the authenticator code when the admin has a
 * verified TOTP factor and this session is still at aal1; when the studio
 * requires two-step sign-in, blocks admins with no factor and shows enrolment.
 * Super-admins are not bound by the studio setting. Fails open on errors.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MfaChallengeGate } from '../components/legal/MfaChallengeGate';

const { aal, listFactors, challengeAndVerify, tenantRow, currentUser } = vi.hoisted(() => ({
  aal: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  tenantRow: vi.fn(),
  currentUser: { role: ['tenant_admin'] as string[] },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: { getAuthenticatorAssuranceLevel: aal, listFactors, challengeAndVerify },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: tenantRow }) }),
    }),
  },
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: currentUser, isLoading: false }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1' }),
}));
vi.mock('../components/legal/TwoFactorSettings', () => ({
  TwoFactorSettings: ({ onEnabled }: { onEnabled?: () => void }) => (
    <button type="button" onClick={onEnabled}>
      enrol-screen
    </button>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MfaChallengeGate>
        <p>admin area</p>
      </MfaChallengeGate>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  aal.mockReset();
  listFactors.mockReset();
  challengeAndVerify.mockReset();
  tenantRow.mockReset();
  currentUser.role = ['tenant_admin'];
});

describe('MfaChallengeGate', () => {
  it('lets the admin through when no second step is needed', async () => {
    aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    renderGate();
    expect(await screen.findByText('admin area')).toBeTruthy();
  });

  it('fails open when the MFA check errors', async () => {
    aal.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderGate();
    expect(await screen.findByText('admin area')).toBeTruthy();
  });

  it('asks for the code, then lets the admin through once verified', async () => {
    aal
      .mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      .mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null });
    challengeAndVerify.mockResolvedValue({ data: {}, error: null });

    renderGate();
    const input = await screen.findByLabelText('legal.security.mfa_code_label');
    expect(screen.queryByText('admin area')).toBeNull();
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('legal.security.challenge_submit'));

    await waitFor(() => expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' }));
    expect(await screen.findByText('admin area')).toBeTruthy();
  });

  it('shows an error for a wrong code', async () => {
    aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null });
    challengeAndVerify.mockResolvedValue({ data: null, error: { message: 'invalid' } });

    renderGate();
    const input = await screen.findByLabelText('legal.security.mfa_code_label');
    fireEvent.change(input, { target: { value: '000000' } });
    fireEvent.click(screen.getByText('legal.security.challenge_submit'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('admin area')).toBeNull();
  });

  describe('studio requires two-step sign-in', () => {
    const noFactorYet = () => {
      aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
      listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    };

    it('setting off: an admin with no factor gets in', async () => {
      noFactorYet();
      tenantRow.mockResolvedValue({ data: { require_admin_mfa: false }, error: null });
      renderGate();
      expect(await screen.findByText('admin area')).toBeTruthy();
    });

    it('setting on: an admin with no factor sees enrolment, then gets in once enrolled', async () => {
      noFactorYet();
      tenantRow.mockResolvedValue({ data: { require_admin_mfa: true }, error: null });
      renderGate();
      expect(await screen.findByText('legal.security.enrol_required_title')).toBeTruthy();
      expect(screen.queryByText('admin area')).toBeNull();

      // Enrolment verifies the factor, which lifts the session to aal2.
      aal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
      fireEvent.click(screen.getByText('enrol-screen'));
      expect(await screen.findByText('admin area')).toBeTruthy();
    });

    it('setting on: an admin already at aal2 gets in without a tenant lookup', async () => {
      aal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
      tenantRow.mockResolvedValue({ data: { require_admin_mfa: true }, error: null });
      renderGate();
      expect(await screen.findByText('admin area')).toBeTruthy();
      expect(tenantRow).not.toHaveBeenCalled();
    });

    it('setting on: a super-admin is not blocked', async () => {
      currentUser.role = ['super_admin', 'tenant_admin'];
      noFactorYet();
      tenantRow.mockResolvedValue({ data: { require_admin_mfa: true }, error: null });
      renderGate();
      expect(await screen.findByText('admin area')).toBeTruthy();
      expect(tenantRow).not.toHaveBeenCalled();
    });

    it('fails open when the studio setting cannot be read', async () => {
      noFactorYet();
      tenantRow.mockResolvedValue({ data: null, error: { message: 'boom' } });
      renderGate();
      expect(await screen.findByText('admin area')).toBeTruthy();
    });

    it('fails open when the factor list cannot be read', async () => {
      aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
      listFactors.mockResolvedValue({ data: null, error: { message: 'boom' } });
      tenantRow.mockResolvedValue({ data: { require_admin_mfa: true }, error: null });
      renderGate();
      expect(await screen.findByText('admin area')).toBeTruthy();
    });
  });
});

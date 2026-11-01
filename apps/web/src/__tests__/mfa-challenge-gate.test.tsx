// @vitest-environment jsdom
/**
 * MfaChallengeGate — asks for the authenticator code only when the admin has a
 * verified TOTP factor and this session is still at aal1; fails open otherwise.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MfaChallengeGate } from '../components/legal/MfaChallengeGate';

const { aal, listFactors, challengeAndVerify } = vi.hoisted(() => ({
  aal: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: { getAuthenticatorAssuranceLevel: aal, listFactors, challengeAndVerify },
    },
  },
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
});

// @vitest-environment jsdom
/**
 * After sign-in, anyone without a login password is offered to set one.
 * "Not now" hides it until the next sign-in; a failed check shows nothing.
 * Run: pnpm -C apps/web test set-password-prompt.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  session: null as null | { access_token: string; user: { id: string } },
  rpc: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: h.session, isLoading: false }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc } }));
vi.mock('@/components/shared/SetPasswordDialog', () => ({
  SetPasswordDialog: (p: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    setTitle?: string;
    cancelLabel?: string;
  }) =>
    p.open ? (
      <div role="dialog" aria-label={p.setTitle}>
        <button type="button" onClick={() => p.onOpenChange(false)}>
          {p.cancelLabel}
        </button>
      </div>
    ) : null,
}));

import i18n from '@/i18n/i18n';
import { SetPasswordPrompt } from '@/features/auth/components/SetPasswordPrompt';

function token(payload: object): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
}

function signIn(sessionId: string, amr: string[] = ['otp']) {
  h.session = {
    access_token: token({ session_id: sessionId, amr: amr.map((method) => ({ method })) }),
    user: { id: 'user-1' },
  };
}

const show = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <SetPasswordPrompt />
      </QueryClientProvider>
    </I18nextProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  h.session = null;
  h.rpc.mockResolvedValue({ data: false, error: null });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('set-a-password prompt', () => {
  it('asks someone with no password to set one', async () => {
    signIn('s1');
    show();
    expect(await screen.findByRole('dialog', { name: 'Set a password' })).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith('my_login_has_password');
  });

  it('shows nothing when they already have a password', async () => {
    signIn('s1');
    h.rpc.mockResolvedValue({ data: true, error: null });
    show();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not check at all after a password sign-in', () => {
    signIn('s1', ['password']);
    show();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows nothing when the check fails', async () => {
    signIn('s1');
    h.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    show();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Not now" hides it for this sign-in, and it comes back at the next one', async () => {
    signIn('s1');
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();
    show();
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();
    signIn('s2');
    show();
    expect(await screen.findByRole('dialog', { name: 'Set a password' })).toBeTruthy();
  });

  it('has Hebrew wording', async () => {
    await i18n.changeLanguage('he');
    signIn('s1');
    show();
    expect(await screen.findByRole('dialog', { name: 'הגדרת סיסמה' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'לא עכשיו' })).toBeTruthy();
  });
});

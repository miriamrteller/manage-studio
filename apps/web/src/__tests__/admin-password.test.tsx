// @vitest-environment jsdom
/**
 * Passwords for studio admins: "Set or change your password" in Settings → Security,
 * "Forgot password?" on the login Password tab (a reset email that returns through
 * /auth/callback to /auth/new-password), and the new-password screen.
 * Emailed links and codes are unchanged.
 * Run: pnpm -C apps/web test admin-password.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  session: null as null | { user: { email: string } },
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: h.session, isLoading: false }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: h.resetPasswordForEmail, updateUser: h.updateUser } },
}));
vi.mock('@/components/shared/SetPasswordDialog', () => ({
  SetPasswordDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="password dialog" /> : null),
}));
vi.mock('@/components/legal/TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('@/components/legal/RequireMfaSetting', () => ({ RequireMfaSetting: () => null }));
vi.mock('@/components/legal/DataExportButton', () => ({ DataExportButton: () => null }));
vi.mock('@/components/legal/PlatformAccessLog', () => ({ PlatformAccessLog: () => null }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => h.navigate,
}));

import i18n from '@/i18n/i18n';
import { passwordResetRedirect, sendPasswordReset } from '@/features/auth/lib/passwordReset';
import { LoginForm } from '@/components/shared/LoginForm';
import NewPasswordPage from '@/pages/auth/NewPasswordPage';
import { SecuritySettingsForm } from '@/features/settings/components/SecuritySettingsForm';

const wrap = (node: ReactNode) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );

beforeEach(() => {
  h.session = null;
  h.resetPasswordForEmail.mockResolvedValue({ error: null });
  h.updateUser.mockResolvedValue({ error: null });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('reset email', () => {
  it('returns to this site (studio subdomain or custom domain) through the sign-in callback', () => {
    expect(passwordResetRedirect('https://lumen.opalswift.com')).toBe('https://lumen.opalswift.com/auth/callback?next=new-password');
    expect(passwordResetRedirect('https://www.mystudio.co.il')).toBe('https://www.mystudio.co.il/auth/callback?next=new-password');
  });

  it('asks Supabase to email the link, with the CAPTCHA token when there is one', async () => {
    await sendPasswordReset(' Owner@Lumen.test ', 'tok-1');
    expect(h.resetPasswordForEmail).toHaveBeenCalledWith('owner@lumen.test', {
      redirectTo: `${window.location.origin}/auth/callback?next=new-password`,
      captchaToken: 'tok-1',
    });
  });
});

describe('"Forgot password?" on the login Password tab', () => {
  function renderLogin(onForgotPassword = vi.fn(async () => {})) {
    wrap(
      <LoginForm
        isLoading={false}
        message={null}
        codeStep="send"
        codeEmail=""
        onSubmit={vi.fn()}
        onVerifyEmailCode={vi.fn()}
        onResendEmailCode={vi.fn()}
        onBackToCodeSend={vi.fn()}
        onForgotPassword={onForgotPassword}
      />,
    );
    return onForgotPassword;
  }

  it('without an email, says to type it first; with one, sends the reset', async () => {
    const onForgot = renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByText(/Type your email above/)).toBeInTheDocument();
    expect(onForgot).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@lumen.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await waitFor(() => expect(onForgot).toHaveBeenCalledWith('owner@lumen.test'));
  });

  it('is not offered on the link and code tabs', () => {
    wrap(
      <LoginForm
        isLoading={false}
        message={null}
        codeStep="send"
        codeEmail=""
        initialMode="magic_link"
        onSubmit={vi.fn()}
        onVerifyEmailCode={vi.fn()}
        onResendEmailCode={vi.fn()}
        onBackToCodeSend={vi.fn()}
        onForgotPassword={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });
});

describe('/auth/new-password', () => {
  it('without a session (expired link), points back to sign in', () => {
    wrap(<NewPasswordPage />);
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login?mode=password');
  });

  it('checks the new password, saves it, then continues to the dashboard', async () => {
    h.session = { user: { email: 'owner@lumen.test' } };
    wrap(<NewPasswordPage />);
    expect(screen.getByText(/Signed in as owner@lumen.test/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Studio2026' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Studio2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the new password' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(h.updateUser).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Studio2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the new password' }));
    expect(await screen.findByText('Your new password is saved.')).toBeInTheDocument();
    expect(h.updateUser).toHaveBeenCalledWith({ password: 'Studio2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(h.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    wrap(<NewPasswordPage />);
    expect(screen.getByRole('heading', { name: 'בחירת סיסמה חדשה' })).toBeInTheDocument();
  });
});

describe('Settings → Security', () => {
  it('admins can set or change their login password there', () => {
    wrap(<SecuritySettingsForm />);
    expect(screen.getByRole('heading', { name: 'Login password' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set or change your password' }));
    expect(screen.getByRole('dialog', { name: 'password dialog' })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * "Change login email" (Settings → Security and the portals): checked first (taken /
 * reserved / same), then Supabase's secure change (both addresses confirm; the old
 * login works until then). Admins can move the business email with it. The
 * confirmation link is always verified, even when someone is signed in.
 * Run: pnpm -C apps/web test change-login-email.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  session: { user: { email: 'owner@lumen.test' } } as null | { user: { email: string } },
  rpc: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: h.session, isLoading: false }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    auth: { updateUser: h.updateUser, verifyOtp: h.verifyOtp, getSession: h.getSession },
  },
}));

import i18n from '@/i18n/i18n';
import { ChangeLoginEmail, emailChangeRedirect } from '@/components/shared/ChangeLoginEmail';
import { establishSessionFromAuthCallback } from '@/lib/authCallback';
import EmailChangedPage from '@/pages/auth/EmailChangedPage';

const wrap = (node: ReactNode) =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );

beforeEach(() => {
  h.session = { user: { email: 'owner@lumen.test' } };
  h.rpc.mockResolvedValue({ data: 'ok', error: null });
  h.updateUser.mockResolvedValue({ data: {}, error: null });
  h.verifyOtp.mockResolvedValue({ data: {}, error: null });
  h.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

function submit(value: string) {
  fireEvent.change(screen.getByLabelText('New login email'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Send confirmation' }));
}

describe('Change login email', () => {
  it('confirmations return through the sign-in callback', () => {
    expect(emailChangeRedirect('https://lumen.opalswift.com')).toBe('https://lumen.opalswift.com/auth/callback?next=email-change');
  });

  it('an admin whose business email is still the login: the tick starts on and is sent with the request', async () => {
    wrap(<ChangeLoginEmail businessEmail="Owner@Lumen.test" />);
    const tick = screen.getByRole('checkbox', { name: 'Also use this as my business email' });
    expect(tick).toBeChecked();
    submit(' New@Lumen.Studio ');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'We sent a confirmation link to owner@lumen.test and to new@lumen.studio. Open both. Until then, keep signing in with owner@lumen.test.',
    );
    expect(h.rpc).toHaveBeenCalledWith('login_email_status', { p_email: 'new@lumen.studio' });
    expect(h.updateUser).toHaveBeenCalledWith(
      { email: 'new@lumen.studio', data: { business_email_follow: true } },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=email-change` },
    );
  });

  it('a different business email: the tick starts off', () => {
    wrap(<ChangeLoginEmail businessEmail="hello@lumen.studio" />);
    expect(screen.getByRole('checkbox', { name: 'Also use this as my business email' })).not.toBeChecked();
  });

  it('the portals (no business email): no tick, and the studio is never touched', async () => {
    wrap(<ChangeLoginEmail />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    submit('parent@new.test');
    await waitFor(() => expect(h.updateUser).toHaveBeenCalled());
    expect(h.updateUser.mock.calls[0][0]).toEqual({ email: 'parent@new.test', data: { business_email_follow: false } });
  });

  it.each([
    ['taken', 'That email already has an OpalSwift account (perhaps at another studio). Use a different address.'],
    ['reserved', 'That address is reserved for OpalSwift. Use a different one.'],
    ['same', 'That is already your login email.'],
  ])('refuses in plain words when the address is %s, without sending', async (reason, text) => {
    h.rpc.mockResolvedValue({ data: reason, error: null });
    wrap(<ChangeLoginEmail />);
    submit('someone@x.test');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('a malformed address is refused before any check', async () => {
    wrap(<ChangeLoginEmail />);
    submit('not-an-email');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    wrap(<ChangeLoginEmail businessEmail="owner@lumen.test" />);
    expect(screen.getByRole('heading', { name: 'שינוי אימייל ההתחברות' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'להשתמש בו גם כאימייל העסק' })).toBeChecked();
  });
});

describe('the confirmation link', () => {
  it('is verified even when someone is already signed in here', async () => {
    const result = await establishSessionFromAuthCallback({ search: '?next=email-change&token_hash=th-1&type=email_change', hash: '' });
    expect(result).toEqual({ ok: true });
    expect(h.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th-1', type: 'email_change' });
  });

  it('an expired link says so', async () => {
    h.verifyOtp.mockResolvedValue({ data: {}, error: new Error('Email link is invalid or has expired') });
    const result = await establishSessionFromAuthCallback({ search: '?token_hash=th-1&type=email_change', hash: '' });
    expect(result).toEqual({ ok: false, message: 'Email link is invalid or has expired' });
  });

  it('lands on a page that says what happens next', () => {
    wrap(<EmailChangedPage />);
    expect(screen.getByRole('heading', { name: 'Thanks, confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/confirmed from both addresses/);
  });
});

// @vitest-environment jsdom
/**
 * Self-serve studio signup (free beta) on app.opalswift.com/create-studio:
 * email link first, then the setup wizard in self-serve mode, then "Go to your studio".
 * Run: pnpm -C apps/web test self-serve-signup.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  session: null as unknown,
  user: null as unknown,
  rpc: vi.fn(),
  invoke: vi.fn(),
  signInWithOtp: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  assign: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: h.session, isLoading: false }) }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: h.user, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }) }));
vi.mock('@/components/LegalFooterLinks', () => ({ LegalFooterLinks: () => <nav aria-label="Legal" /> }));
vi.mock('@/legal/acceptance', () => ({ platformTermsVersion: async () => 'v-test-1' }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    functions: { invoke: h.invoke },
    auth: { signInWithOtp: h.signInWithOtp, getSession: h.getSession, signOut: h.signOut },
  },
}));

import i18n from '@/i18n/i18n';
import CreateStudioPage from '@/pages/CreateStudioPage';

function setLocation(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, origin: `https://${hostname}`, search: '', hash: '', assign: h.assign },
  });
}

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/create-studio']}>
          <Routes>
            <Route path="/create-studio" element={<CreateStudioPage />} />
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/" element={<p>welcome page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const confirmedSession = { user: { id: 'u-new', email: 'owner@yoga.test' }, access_token: 'at-1', refresh_token: 'rt-1' };

/** Studio → Type → Payments → Colours → Address, ending on the Review step. */
async function fillWizard(address = 'harbour-yoga') {
  fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Harbour Yoga' } });
  expect(screen.queryByLabelText('Web address')).not.toBeInTheDocument();
  next();
  await screen.findByText('What kind of business is it?');
  next();
  next();
  next();
  fireEvent.change(screen.getByLabelText('Web address'), { target: { value: address } });
  await screen.findByText('This address is available.');
  next();
  await screen.findByText('Check the details');
}

function functionRefusal(code: string) {
  return {
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { json: async () => ({ error: code }) },
    }),
  };
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'true');
  setLocation('app.opalswift.com');
  h.session = null;
  h.user = null;
  h.rpc.mockResolvedValue({ data: true, error: null });
  h.signInWithOtp.mockResolvedValue({ error: null });
  h.getSession.mockResolvedValue({ data: { session: confirmedSession }, error: null });
  h.signOut.mockResolvedValue({ error: null });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('self-serve signup: start', () => {
  it('is off without VITE_ENABLE_SELF_SERVE_SIGNUP', () => {
    vi.stubEnv('VITE_ENABLE_SELF_SERVE_SIGNUP', 'false');
    renderPage();
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('is only on the platform host, never on a studio host', () => {
    setLocation('creativeballet.opalswift.com');
    renderPage();
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('emails a confirmation link that comes back here; no studio is created yet', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Create your studio' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Owner@Yoga.test ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('We sent a link to owner@yoga.test');
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@yoga.test',
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'https://app.opalswift.com/create-studio',
        data: { signup: 'self_serve_studio', first_name: 'Dana', last_name: '', language: 'en' },
      },
    });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('the check-email screen has a spam hint and a working Resend', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@yoga.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(screen.getByText(/spam or junk folder/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend the email' }));
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('We sent it again to owner@yoga.test.')).toBeInTheDocument();
  });

  it('with a Turnstile site key, the link is sent only after the check', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    renderPage();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@yoga.test' } });
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeDisabled();
    expect(h.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('self-serve signup: wizard', () => {
  beforeEach(() => {
    h.session = confirmedSession;
  });

  it('full path: creates the studio, stores the terms version, then signs the owner in on the studio', async () => {
    h.invoke.mockResolvedValue({ data: { tenantId: 't-new', subdomain: 'harbour-yoga' }, error: null });
    renderPage();
    expect(screen.getByText('Signed in as owner@yoga.test')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set up your studio' })).toBeInTheDocument();
    await fillWizard();
    expect(screen.queryByText("Owner's email")).not.toBeInTheDocument();

    const create = screen.getByRole('button', { name: 'Create studio' });
    expect(create).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/legal/platform-terms');
    fireEvent.click(create);

    expect(await screen.findByRole('heading', { name: 'Harbour Yoga is ready' })).toBeInTheDocument();
    const body = h.invoke.mock.calls[0][1].body;
    expect(h.invoke.mock.calls[0][0]).toBe('provision-studio');
    expect(body).toMatchObject({
      action: 'self_serve',
      name: 'Harbour Yoga',
      subdomain: 'harbour-yoga',
      paymentProvider: 'ypay',
      invoicingProvider: 'grow',
      primaryColor: '#5B6CFF',
      termsVersion: 'v-test-1',
      termsLanguage: 'en',
    });
    expect(body).not.toHaveProperty('ownerEmail');
    expect(screen.getByText('A checklist is waiting for you')).toBeInTheDocument();
    expect(screen.getByText('harbour-yoga.opalswift.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to your studio' }));
    await waitFor(() => expect(h.assign).toHaveBeenCalled());
    expect(h.assign).toHaveBeenCalledWith(
      'https://harbour-yoga.opalswift.com/auth/session-handoff#access_token=at-1&refresh_token=rt-1&token_type=bearer',
    );
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('business email (clients see this): starts as the account email; a different one is sent with the studio', async () => {
    h.invoke.mockResolvedValue({ data: { tenantId: 't-new', subdomain: 'harbour-yoga' }, error: null });
    renderPage();
    const business = await screen.findByLabelText('Business email');
    await waitFor(() => expect(business).toHaveValue('owner@yoga.test'));
    fireEvent.change(business, { target: { value: 'hello@harbouryoga.co.il' } });
    await fillWizard();
    expect(screen.getByText('hello@harbouryoga.co.il')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    await screen.findByRole('heading', { name: 'Harbour Yoga is ready' });
    expect(h.invoke.mock.calls[0][1].body.contact).toEqual({ email: 'hello@harbouryoga.co.il' });
  });

  it('a taken or reserved address is refused as you type', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    renderPage();
    fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Harbour Yoga' } });
    next();
    await screen.findByText('What kind of business is it?');
    next();
    next();
    next();
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'billing' } });
    expect(await screen.findByText('This address is already taken.')).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith('check_subdomain_available', { p_subdomain: 'billing' });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('a second studio for the same account is refused in plain words', async () => {
    h.invoke.mockResolvedValue(functionRefusal('account_has_studio'));
    renderPage();
    await fillWizard();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account already has a studio');
  });

  it('an unconfirmed email is refused in plain words', async () => {
    h.invoke.mockResolvedValue(functionRefusal('email_not_confirmed'));
    renderPage();
    await fillWizard();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create studio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please confirm your email first');
  });

  it('an account that already has a studio is not shown the wizard', () => {
    h.user = { id: 'u-new', role: ['tenant_admin'], tenant_id: 't-1' };
    renderPage();
    expect(screen.getByRole('heading', { name: 'You already have a studio' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Studio name')).not.toBeInTheDocument();
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderPage();
    expect(screen.getByRole('heading', { name: 'הקמת הסטודיו שלכם' })).toBeInTheDocument();
  });
});

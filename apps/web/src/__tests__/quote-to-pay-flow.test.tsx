// @vitest-environment jsdom
/**
 * Client booking flow, one page to the next with no waiting for the studio:
 *   /quote/:token  "Accept and pay deposit" → straight to payment (signing is offered there)
 *   /enrol/complete (job contract) "Pay the deposit now" any time; sign → straight to payment, or the portal
 * plus the admin booking progress strip. Dance waivers keep today's behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import EnrolCompletePage from '@/pages/EnrolCompletePage';
import { PublicQuoteView } from '@/features/quotes/components/public/PublicQuoteView';
import { buildBookingProgress } from '@/features/jobs/lib/bookingProgress';
import { safePayPath, safeSignPath } from '@/features/jobs/lib/bookingFlowPaths';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';
import { fillSignerDetails } from './helpers/signerDetails';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

// Signed-out visitor unless a test sets a user (drives the back-to-portal link).
const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string[] } }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: auth.user, isLoading: false, isProfileChecked: true }),
}));

const invoke = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
    },
    rpc: (...args: unknown[]) => rpc(...args),
    from: vi.fn(),
  },
}));

const QUOTE_TOKEN = 'a'.repeat(64);
const ENG = '11111111-1111-4111-8111-111111111111';
const PAY_PATH = `/pay/${'d'.repeat(48)}`;
const SIGN_PATH = `/enrol/complete?engagementId=${ENG}&wt=eyJlaWQiOiJ4In0.c2ln`;

const TEMPLATE = { id: '33333333-3333-4333-8333-333333333333', version: 1, name: 'Contract', content: 'Terms' };
const PERSON_ID = '44444444-4444-4444-8444-444444444444';
const OFFERING_ID = '55555555-5555-4555-8555-555555555555';

class ImmediateIntersectionObserver {
  constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() { this.cb([{ isIntersecting: true }]); }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

function publicQuote(status: 'sent' | 'accepted') {
  return {
    status, title: 'Family session', currency: 'ILS', shoot_date: '2026-11-20', valid_until: '2026-12-31',
    notes: null, deposit_percent: 30, total_minor: 100000, deposit_minor: 30000, balance_minor: 70000,
    accepted_at: status === 'accepted' ? '2026-10-30T10:00:00Z' : null, client_name: 'Pat',
    lines: [{ id: 'l1', description: 'Session', qty: 1, unit_price_minor: 100000, line_total_minor: 100000, is_optional: false, is_selected: true }],
  };
}

/** Route fetches by function name; records every call. */
function mockFunctions(handlers: Record<string, { body: Record<string, unknown>; status?: number }>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const name = String(url).split('/functions/v1/')[1] ?? '';
    const handler = handlers[name];
    if (!handler) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(handler.body), {
      status: handler.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const calledFunctions = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url]) => String(url).split('/functions/v1/')[1]);

function renderSignPage() {
  return renderInApp(<EnrolCompletePage />, {
    path: '/enrol/complete',
    initialEntry: `/enrol/complete?engagementId=${ENG}&wt=token-1`,
    extraRoutes: { '/pay/:token': <p>PAY PAGE</p>, '/dashboard/portal': <p>PORTAL PAGE</p> },
  });
}

const AGREE =
  'I have read and agree to the contract, my details above are correct, and I understand that typing my name and ticking this box is my electronic signature.';

async function signContract(name = 'Pat Client') {
  const agree = await screen.findByRole('checkbox', { name: AGREE });
  fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: name } });
  fillSignerDetails({ noConfirmTick: true });
  fireEvent.click(agree);
  fireEvent.click(screen.getByRole('button', { name: 'Sign contract' }));
}

beforeEach(async () => {
  await setLanguage('en');
  auth.user = null;
  invoke.mockReset();
  rpc.mockReset();
  invoke.mockImplementation(async (name: string) => {
    if (name === 'waiver-viewed') return { data: { view_token: 'vt', viewed_at_ts: 1 }, error: null };
    if (name === 'accept-waiver') return { data: { evidence_id: 'ev-1' }, error: null };
    return { data: null, error: null };
  });
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safe next-step paths', () => {
  it('only follows the two known shapes', () => {
    expect(safeSignPath(SIGN_PATH)).toBe(SIGN_PATH);
    expect(safePayPath(PAY_PATH)).toBe(PAY_PATH);
    expect(safeSignPath('https://evil.test/enrol/complete?engagementId=x&wt=y')).toBeNull();
    expect(safePayPath('//evil.test/pay/abc')).toBeNull();
    expect(safePayPath('/pay/not-hex')).toBeNull();
  });
});

describe('/quote/:token success state', () => {
  beforeEach(() => setTenant('photographer'));

  it('Accept and pay deposit: one button, straight to payment; signing is handed on to be offered there', async () => {
    let status: 'sent' | 'accepted' = 'sent';
    rpc.mockImplementation(async () => ({ data: publicQuote(status), error: null }));
    invoke.mockImplementation(async (name: string) => {
      if (name !== 'accept-quote') return { data: null, error: null };
      status = 'accepted';
      return { data: { ok: true, already_accepted: false, contractSignPath: SIGN_PATH, depositPayPath: PAY_PATH }, error: null };
    });
    function PayStub() {
      const state = useLocation().state as { signPath?: string } | null;
      return <p>PAY PAGE {state?.signPath}</p>;
    }
    renderInApp(<PublicQuoteView token={QUOTE_TOKEN} />, {
      path: '/quote/:token', initialEntry: `/quote/${QUOTE_TOKEN}`, extraRoutes: { '/pay/:token': <PayStub /> },
    });

    expect(screen.queryByRole('button', { name: 'Accept and book' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept and pay deposit' }));
    expect(await screen.findByText(`PAY PAGE ${SIGN_PATH}`)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(PAY_PATH);
  });

  it('no contract template → straight to the deposit too', async () => {
    rpc.mockResolvedValue({ data: publicQuote('sent'), error: null });
    invoke.mockResolvedValue({ data: { ok: true, depositPayPath: PAY_PATH }, error: null });
    renderInApp(<PublicQuoteView token={QUOTE_TOKEN} />, {
      path: '/quote/:token', initialEntry: `/quote/${QUOTE_TOKEN}`, extraRoutes: { '/pay/:token': <p>PAY PAGE</p> },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept and pay deposit' }));
    expect(await screen.findByText('PAY PAGE')).toBeInTheDocument();
  });

  it('revisiting an accepted quote replays the (idempotent) accept and goes on to the unpaid deposit', async () => {
    rpc.mockResolvedValue({ data: publicQuote('accepted'), error: null });
    invoke.mockResolvedValue({ data: { ok: true, already_accepted: true, contractSignPath: SIGN_PATH, depositPayPath: PAY_PATH }, error: null });
    renderInApp(<PublicQuoteView token={QUOTE_TOKEN} />, { path: '/quote/:token', initialEntry: `/quote/${QUOTE_TOKEN}` });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your booking' }));
    // Deposit still unpaid: straight back to paying it.
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(PAY_PATH));
    expect(invoke).toHaveBeenCalledWith('accept-quote', expect.objectContaining({ body: expect.objectContaining({ token: QUOTE_TOKEN }) }));
  });

  it('deposit already paid: the contract is still offered on the quote', async () => {
    rpc.mockResolvedValue({ data: publicQuote('accepted'), error: null });
    invoke.mockResolvedValue({ data: { ok: true, already_accepted: true, contractSignPath: SIGN_PATH }, error: null });
    renderInApp(<PublicQuoteView token={QUOTE_TOKEN} />, { path: '/quote/:token', initialEntry: `/quote/${QUOTE_TOKEN}` });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your booking' }));
    expect(await screen.findByRole('button', { name: 'Continue to sign the contract' })).toBeInTheDocument();
  });

  it('ignores a link that is not one of ours', async () => {
    rpc.mockResolvedValue({ data: publicQuote('sent'), error: null });
    invoke.mockResolvedValue({ data: { ok: true, contractSignPath: 'https://evil.test/x' }, error: null });
    renderInApp(<PublicQuoteView token={QUOTE_TOKEN} />, { path: '/quote/:token', initialEntry: `/quote/${QUOTE_TOKEN}` });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept and pay deposit' }));
    rpc.mockResolvedValue({ data: publicQuote('accepted'), error: null });
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Continue to/ })).not.toBeInTheDocument();
  });
});

describe('/enrol/complete — job contract continues to the deposit', () => {
  beforeEach(() => setTenant('photographer'));

  const ready = { isJob: true, personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE };

  it('deposit unpaid → straight to the payment page after signing, no screen in between', async () => {
    const fetchMock = mockFunctions({
      'get-waiver-engagement': { body: ready },
      'job-next-step': { body: { next: 'pay_deposit', payPath: PAY_PATH, amountMinor: 30000, currency: 'ILS' } },
    });
    renderSignPage();
    await signContract();

    expect(await screen.findByText('PAY PAGE')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(PAY_PATH);

    // The pay link comes from the server, authorised by the same signing token.
    const nextCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/job-next-step'));
    expect(nextCall).toBeDefined();
    const init = nextCall![1] as unknown as { headers: Record<string, string>; body: string };
    expect(new Headers(init.headers).get('Authorization')).toBe('WaiverToken token-1');
    expect(JSON.parse(String(init.body))).toEqual({ engagementId: ENG });
  });

  it('the contract never blocks payment: "Pay the deposit now" goes to payment without signing', async () => {
    mockFunctions({
      'get-waiver-engagement': { body: ready },
      'job-next-step': { body: { next: 'pay_deposit', payPath: PAY_PATH, amountMinor: 30000, currency: 'ILS' } },
    });
    renderSignPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pay the deposit now (you can sign the contract later)' }));
    expect(await screen.findByText('PAY PAGE')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('accept-waiver', expect.anything());
  });

  it('deposit already paid / no deposit → client portal link instead', async () => {
    mockFunctions({
      'get-waiver-engagement': { body: ready },
      'job-next-step': { body: { next: 'portal', portalPath: '/dashboard/portal', reason: 'deposit_paid' } },
    });
    renderSignPage();
    await signContract();
    fireEvent.click(await screen.findByRole('button', { name: 'Go to your client portal' }));
    expect(await screen.findByText('PORTAL PAGE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay deposit' })).not.toBeInTheDocument();
  });

  it('re-opening the link after signing goes straight to the deposit', async () => {
    mockFunctions({
      'get-waiver-engagement': { body: { alreadySigned: true, isJob: true } },
      'job-next-step': { body: { next: 'pay_deposit', payPath: PAY_PATH, amountMinor: 30000, currency: 'ILS' } },
    });
    renderSignPage();
    expect(await screen.findByText('PAY PAGE')).toBeInTheDocument();
  });

  it('next step unavailable (e.g. token rejected) → the way back to the portal, with a note', async () => {
    mockFunctions({
      'get-waiver-engagement': { body: ready },
      'job-next-step': { body: { error: 'token_mismatch' }, status: 403 },
    });
    renderSignPage();
    await signContract();
    expect(await screen.findByText('We could not load the next step. The payment link is also in your booking email.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to see my bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to my dashboard' })).not.toBeInTheDocument();
  });

  it('Hebrew', async () => {
    await setLanguage('he');
    mockFunctions({
      'get-waiver-engagement': { body: ready },
      'job-next-step': { body: { next: 'pay_deposit', payPath: PAY_PATH, amountMinor: 30000, currency: 'ILS' } },
    });
    renderSignPage();
    expect(await screen.findByRole('button', { name: 'לתשלום המקדמה עכשיו (אפשר לחתום על החוזה אחר כך)' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'קראתי את החוזה ואני מסכים/ה לו, הפרטים שלמעלה נכונים, ואני מבין/ה שהקלדת שמי וסימון תיבה זו הם החתימה האלקטרונית שלי.',
      }),
    ).toBeInTheDocument();
  });
});

describe('/enrol/complete — dance health declaration behaves as before (only its name changed)', () => {
  beforeEach(() => setTenant('dance'));

  it('sign → dashboard button; never asks for a job next step', async () => {
    const fetchMock = mockFunctions({
      'get-waiver-engagement': { body: { personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE } },
      'job-next-step': { body: { next: 'pay_deposit', payPath: PAY_PATH, amountMinor: 1, currency: 'ILS' } },
    });
    renderSignPage();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'I have read and agree to this health declaration, my details above are correct, and I understand that typing my name and ticking this box is my electronic signature.' }));
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Dana Dancer' } });
    fillSignerDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));
    expect(await screen.findByText('Health declaration signed — welcome!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to my dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay deposit' })).not.toBeInTheDocument();
    expect(calledFunctions(fetchMock)).toEqual(['get-waiver-engagement']);
  });

  it('already signed → dashboard button; never asks for a job next step', async () => {
    const fetchMock = mockFunctions({ 'get-waiver-engagement': { body: { alreadySigned: true } } });
    renderSignPage();
    expect(await screen.findByText('Health declaration already signed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to my dashboard' })).toBeInTheDocument();
    expect(calledFunctions(fetchMock)).toEqual(['get-waiver-engagement']);
  });
});

describe('admin booking progress', () => {
  const acceptedQuote = {
    accepted_at: '2026-10-30T10:00:00Z',
    accepted_result: { deposit_minor: 30000, payment_request_ids: ['dep', 'bal'] },
  };

  it('ticks off Quote accepted → Contract signed → Deposit paid as they happen', () => {
    const open = buildBookingProgress({
      acceptedQuote, contractSigned: false, contractSignedAt: null,
      requests: [{ id: 'dep', status: 'pending', paid_at: null }, { id: 'bal', status: 'pending', paid_at: null }],
    });
    expect(open.map((s) => [s.key, s.done])).toEqual([
      ['quote_accepted', true], ['contract_signed', false], ['deposit_paid', false],
    ]);

    const done = buildBookingProgress({
      acceptedQuote, contractSigned: true, contractSignedAt: '2026-10-30T10:05:00Z',
      requests: [{ id: 'dep', status: 'paid', paid_at: '2026-10-30T10:07:00Z' }, { id: 'bal', status: 'pending', paid_at: null }],
    });
    expect(done).toEqual([
      { key: 'quote_accepted', done: true, at: '2026-10-30T10:00:00Z' },
      { key: 'contract_signed', done: true, at: '2026-10-30T10:05:00Z' },
      { key: 'deposit_paid', done: true, at: '2026-10-30T10:07:00Z' },
    ]);
  });

  it('a booking without a deposit says so instead of waiting forever', () => {
    const steps = buildBookingProgress({
      acceptedQuote: { ...acceptedQuote, accepted_result: { deposit_minor: 0, payment_request_ids: ['bal'] } },
      contractSigned: false, contractSignedAt: null, requests: [{ id: 'bal', status: 'paid', paid_at: 'x' }],
    });
    expect(steps[2]).toEqual({ key: 'deposit_paid', done: false, at: null, notApplicable: true });
  });
});

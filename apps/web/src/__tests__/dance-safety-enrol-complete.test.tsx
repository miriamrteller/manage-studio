// @vitest-environment jsdom
/**
 * Dance safety for /enrol/complete + WaiverStep: a programs/dance tenant (and
 * generic / vertical-less ones) must render the exact base waiver copy, as on
 * main. The photographer tenant gets the contract wording from the overlay on
 * the same, unchanged components.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import EnrolCompletePage from '@/pages/EnrolCompletePage';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { baseValue, renderInApp, setLanguage, setTenant, type FakeTenantKind } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn(),
  },
}));

const TEMPLATE = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  name: 'Template',
  content: 'Terms text',
};
const PERSON_ID = '22222222-2222-4222-8222-222222222222';
const OFFERING_ID = '33333333-3333-4333-8333-333333333333';

function mockGuestFetch(body: Record<string, unknown>, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  );
}

class ImmediateIntersectionObserver {
  constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.cb([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function renderPage() {
  return renderInApp(<EnrolCompletePage />, {
    path: '/enrol/complete',
    initialEntry: '/enrol/complete?engagementId=eng-1&wt=token-1',
  });
}

beforeEach(async () => {
  await setLanguage('en');
  invoke.mockReset();
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

const DANCE_LIKE: FakeTenantKind[] = ['dance', 'generic', 'none'];

describe.each(DANCE_LIKE)('EnrolCompletePage — %s tenant keeps the dance copy', (kind) => {
  beforeEach(() => setTenant(kind));

  it('already signed', async () => {
    mockGuestFetch({ alreadySigned: true });
    renderPage();
    expect(await screen.findByText('Waiver already signed')).toBeInTheDocument();
    expect(screen.getByText('Your waiver has been signed and your enrolment is now active.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign your waiver');
  });

  it('cancelled', async () => {
    mockGuestFetch({ cancelled: true });
    renderPage();
    expect(await screen.findByText('Enrolment cancelled')).toBeInTheDocument();
    expect(screen.getByText(baseValue('pages.enrol_complete.cancelled_body'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse classes' })).toBeInTheDocument();
  });

  it('expired link', async () => {
    mockGuestFetch({ error: 'expired' }, 401);
    renderPage();
    expect(await screen.findByText('Your link has expired')).toBeInTheDocument();
  });

  it('ready → sign → "See you in class!"', async () => {
    mockGuestFetch({ personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE });
    renderPage();
    expect(
      await screen.findByText('Please read the waiver carefully and sign below to activate your enrolment.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Waiver document' })).toBeInTheDocument();

    const checkbox = await screen.findByRole('checkbox', { name: 'I have read and accept this waiver' });
    expect(screen.getByText('I have read and accept this waiver')).toBeInTheDocument();
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Dana Dancer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));

    expect(await screen.findByText('Waiver signed — welcome!')).toBeInTheDocument();
    expect(
      screen.getByText('Your waiver has been signed and your enrolment is now active. See you in class!'),
    ).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('accept-waiver', expect.anything());
  });

  it('Hebrew dance copy is unchanged too', async () => {
    await setLanguage('he');
    mockGuestFetch({ alreadySigned: true });
    renderPage();
    expect(await screen.findByText('הויתור כבר נחתם')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('חתמו על כתב הויתור');
  });
});

describe('WaiverStep — dance tenant (enrolment stepper usage)', () => {
  beforeEach(() => setTenant('dance'));

  it('shows Student / Class context, guardian declaration and waiver wording', async () => {
    renderInApp(
      <WaiverStep
        personId={PERSON_ID}
        template={TEMPLATE}
        offeringId={OFFERING_ID}
        onComplete={() => undefined}
        onPrevious={() => undefined}
        canGoBack
        studentName="Noa"
        className="Ballet 1"
        termName="Autumn"
        isMinorStudent
      />,
    );
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByText('Ballet 1 — Autumn')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Waiver document' })).toBeInTheDocument();
    expect(await screen.findByText('I have read and accept this waiver')).toBeInTheDocument();
    expect(
      screen.getByText(
        'I confirm I am the parent or legal guardian of Noa and am authorised to sign this waiver on their behalf.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign and Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('minor self-signing is still hard-blocked with the waiver wording', () => {
    renderInApp(
      <WaiverStep
        personId={PERSON_ID}
        template={TEMPLATE}
        offeringId={OFFERING_ID}
        onComplete={() => undefined}
        onPrevious={() => undefined}
        canGoBack={false}
        studentName="Noa"
        isMinorStudent
        signerIsTheStudent
      />,
    );
    expect(screen.getByText('A parent or guardian must sign')).toBeInTheDocument();
    expect(screen.getByText(baseValue('enrolment.waiver_minor_cannot_sign_body').replace('{{studentName}}', 'Noa'))).toBeInTheDocument();
  });
});

describe('EnrolCompletePage — photographer tenant gets the contract wording', () => {
  beforeEach(() => setTenant('photographer'));

  it('ready → sign → "Contract signed — thank you!"', async () => {
    mockGuestFetch({ personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE });
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign your contract');
    expect(
      await screen.findByText('Please read the contract carefully and sign below to confirm your booking.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contract document' })).toBeInTheDocument();
    const checkbox = await screen.findByRole('checkbox', { name: 'I have read and accept this contract' });
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Pat Client' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign contract' }));

    expect(await screen.findByText('Contract signed — thank you!')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your contract is signed and your shoot is booked. We're looking forward to working with you!",
      ),
    ).toBeInTheDocument();
    const page = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
    expect(page.textContent).not.toMatch(/waiver|enrol|class/i);
  });

  it('already signed / cancelled variants', async () => {
    mockGuestFetch({ alreadySigned: true });
    const first = renderPage();
    expect(await screen.findByText('Contract already signed')).toBeInTheDocument();
    first.unmount();

    mockGuestFetch({ cancelled: true });
    renderPage();
    expect(await screen.findByText('Shoot cancelled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View packages' })).toBeInTheDocument();
  });

  it('Hebrew', async () => {
    await setLanguage('he');
    mockGuestFetch({ personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE });
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('חתמו על החוזה');
    const checkbox = await screen.findByRole('checkbox', { name: 'קראתי את החוזה ואני מסכים/ה לו' });
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText(baseValue('enrolment.waiver_name_label', 'he')), {
      target: { value: 'לקוח' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'חתימה על החוזה' }));
    expect(await screen.findByText('החוזה נחתם — תודה!')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/מחכים לעבוד איתך!/)).toBeInTheDocument());
  });
});

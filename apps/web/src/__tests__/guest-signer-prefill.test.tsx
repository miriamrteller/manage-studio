// @vitest-environment jsdom
/**
 * Guest signing link (/enrol/complete?wt=): the signer's name and phone come
 * prefilled from the person the link was sent to (get-waiver-engagement
 * signerPrefill). The ID number and address never do, and a bad link
 * prefills nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import EnrolCompletePage from '@/pages/EnrolCompletePage';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const invoke = vi.fn();
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }),
}));
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


const PREFILL = {
  full_name: 'Dana Cohen',
  email: 'dana@example.test',
  phone: '050-000-0001',
  // A response must never carry these; if one did, the page still ignores them.
  id_number: '000000018',
  address: '1 Example St',
};

describe('guest link signer prefill', () => {
  beforeEach(() => setTenant('dance'));

  it('prefills the name and phone, and leaves the ID number and address blank', async () => {
    mockGuestFetch({ personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE, signerPrefill: PREFILL });
    renderPage();
    const name = (await screen.findByLabelText('Full legal name')) as HTMLInputElement;
    expect(name.value).toBe('Dana Cohen');
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('050-000-0001');
    expect((screen.getByLabelText('ID number (teudat zehut)', { exact: false }) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Home address') as HTMLInputElement).value).toBe('');
  });

  it('prefilled fields stay editable', async () => {
    mockGuestFetch({ personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE, signerPrefill: PREFILL });
    renderPage();
    const phone = (await screen.findByLabelText('Phone number')) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '052-111-2222' } });
    expect(phone.value).toBe('052-111-2222');
  });

  it('an invalid or expired link prefills nothing', async () => {
    mockGuestFetch({ error: 'WaiverToken invalid or expired', signerPrefill: PREFILL }, 401);
    renderPage();
    expect(await screen.findByText('Your link has expired')).toBeInTheDocument();
    expect(screen.queryByLabelText('Full legal name')).toBeNull();
    expect(screen.queryByDisplayValue('Dana Cohen')).toBeNull();
    expect(screen.queryByDisplayValue('050-000-0001')).toBeNull();
  });

  it('without a prefill in the response the fields start blank', async () => {
    mockGuestFetch({ personId: PERSON_ID, offeringId: OFFERING_ID, template: TEMPLATE });
    renderPage();
    expect(((await screen.findByLabelText('Full legal name')) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('');
  });

  it('is ignored outside a guest link', async () => {
    renderInApp(
      <WaiverStep
        personId={PERSON_ID}
        template={TEMPLATE}
        offeringId={OFFERING_ID}
        onComplete={() => undefined}
        onPrevious={() => undefined}
        canGoBack={false}
        guestSignerPrefill={{ fullName: 'Dana Cohen', phone: '050-000-0001' }}
      />,
    );
    expect(((await screen.findByLabelText('Full legal name')) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('');
  });
});

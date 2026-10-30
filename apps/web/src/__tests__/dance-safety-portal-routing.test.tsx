// @vitest-environment jsdom
/**
 * Dance safety for the portal + routing composition points:
 *  - PortalDashboard renders ParentPortal (children, Add child, DOB, Enrol new)
 *    for every non-photographer tenant, and ClientPortal only for photographers;
 *  - EnrolmentRow is back to main (no job gallery card, even on a services preset);
 *  - DashboardRedirectPage sends dance enrolment intents to /enrol, photographer
 *    clients to their portal;
 *  - /enrol renders the dance enrolment flow except for photographer tenants.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import PortalDashboard from '@/pages/PortalDashboard';
import DashboardRedirectPage from '@/pages/DashboardRedirectPage';
import { EnrolEntryRoute } from '@/layouts/EnrolEntryRoute';
import { baseValue, renderInApp, setLanguage, setTenant, type FakeTenantKind } from './helpers/verticalHarness';
import type { ParentPortalData } from '@/components/Dashboard/useParentPortal';
import type { ClientPortalData } from '@/features/jobs/hooks/useClientPortal';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const auth = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'client@example.com', role: ['account_holder'] as string[], person_id: null as string | null },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuthSession: () => ({ session: { user: { id: auth.user.id } }, isLoading: false }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: auth.user, isLoading: false, isProfileChecked: true }),
}));

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn(() => {
      throw new Error('unexpected direct table read in this test');
    }),
  },
}));

vi.mock('@/features/notifications/hooks/useContactPreferences', () => ({
  useContactPreferences: () => ({
    preferences: { whatsapp_number: '+972501234567' },
    isLoading: false,
    updatePreferencesAsync: vi.fn(),
    isUpdating: false,
  }),
}));

const portal = vi.hoisted(() => ({
  parent: null as ParentPortalData | null,
  client: null as ClientPortalData | null,
}));
vi.mock('@/components/Dashboard/useParentPortal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useParentPortal: () => ({ data: portal.parent, isLoading: false, error: null }),
}));
vi.mock('@/features/jobs/hooks/useClientPortal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useClientPortal: () => ({ data: portal.client, isLoading: false, error: null }),
}));
vi.mock('@/features/jobs/components/ClientJobGalleryCard', () => ({
  ClientJobGalleryCard: ({ engagementId, mode }: { engagementId: string; mode?: string }) => (
    <p data-testid="gallery-card">{`${engagementId}:${mode ?? 'full'}`}</p>
  ),
}));
vi.mock('@/pages/EnrolPage', () => ({ default: () => <p>DANCE ENROL FLOW</p> }));

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const GUARDIAN = '10000000-0000-4000-8000-000000000001';
const CHILD = '10000000-0000-4000-8000-000000000002';
const ACCOUNT = '10000000-0000-4000-8000-000000000003';
const OFFERING = '10000000-0000-4000-8000-000000000004';

function danceData(): ParentPortalData {
  return {
    guardian: {
      personId: GUARDIAN,
      accountId: ACCOUNT,
      accountMemberId: 'm-1',
      name: 'Guardian Parent',
      email: 'parent@example.com',
      phone: null,
      dateOfBirth: null,
    },
    guardianMissing: false,
    children: [
      {
        id: CHILD,
        tenant_id: TENANT_ID,
        user_profile_id: null,
        account_id: ACCOUNT,
        name: 'Little Dancer',
        email: null,
        date_of_birth: '2016-05-01',
        medical_notes: null,
        allergies: null,
        photo_consent: false,
        media_consent: false,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    enrolmentsByPerson: {
      [GUARDIAN]: [],
      [CHILD]: [
        {
          id: '10000000-0000-4000-8000-000000000005',
          tenant_id: TENANT_ID,
          person_id: CHILD,
          offering_id: OFFERING,
          status: 'active',
          created_at: '2026-01-01T00:00:00.000Z',
          className: 'Ballet 1',
          classDay: 1,
          classStartTime: '16:00:00',
          classLocation: 'Studio A',
        },
      ],
    },
    payments: [],
  };
}

function clientData(): ClientPortalData {
  return {
    self: { personId: GUARDIAN, accountId: ACCOUNT, name: 'Pat Client', email: 'pat@example.com' },
    shoots: [
      {
        engagementId: 'eng-shoot-1',
        personId: GUARDIAN,
        jobStatus: 'booked',
        location: 'Jaffa Port',
        galleryReleased: false,
        bookedStartsAt: '2026-12-01T10:00:00.000Z',
        bookedEndsAt: null,
        engagementStatus: 'active',
        packageName: 'Wedding Gold',
        contractSigned: false,
      },
    ],
    requests: [
      {
        id: 'req-1',
        tenant_id: TENANT_ID,
        engagement_id: 'eng-shoot-1',
        label: 'Deposit',
        amount_minor: 150000,
        currency: 'ILS',
        due_date: '2026-11-15',
        status: 'paid',
        payment_id: 'pay-1',
        sent_at: null,
        paid_at: '2026-11-01T09:00:00.000Z',
        max_installments: 1,
        public_token: 'tok-paid',
        refunded_at: null,
        created_at: '2026-10-30T00:00:00.000Z',
        payment: { id: 'pay-1', payment_method: 'card', invoice_url: 'https://docs.example/r1', external_document_number: '1001', status: 'completed' },
      },
      {
        id: 'req-2',
        tenant_id: TENANT_ID,
        engagement_id: 'eng-shoot-1',
        label: 'Balance',
        amount_minor: 350000,
        currency: 'ILS',
        due_date: '2026-12-01',
        status: 'sent',
        payment_id: null,
        sent_at: '2026-10-30T00:00:00.000Z',
        paid_at: null,
        max_installments: 1,
        public_token: 'tok-open',
        refunded_at: null,
        created_at: '2026-10-30T00:00:01.000Z',
        payment: null,
      },
    ],
  };
}

beforeEach(async () => {
  await setLanguage('en');
  auth.user = { id: 'user-1', email: 'client@example.com', role: ['account_holder'], person_id: null };
  portal.parent = danceData();
  portal.client = clientData();
  invoke.mockReset();
  sessionStorage.clear();
});

describe.each<FakeTenantKind>(['dance', 'generic', 'none', 'beautician'])(
  'PortalDashboard — %s tenant renders the dance ParentPortal unchanged',
  (kind) => {
    beforeEach(() => setTenant(kind));

    it('children, Add child, DOB, Enrol new and the parent subtitle', () => {
      renderInApp(<PortalDashboard />, { path: '/dashboard/portal' });
      expect(screen.getByRole('heading', { name: baseValue('pages.portal_dashboard') })).toBeInTheDocument();
      expect(screen.getByText("View your classes, your children's enrolments, and payment history.")).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: baseValue('pages.portal.children_heading') })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: baseValue('pages.portal.add_child') })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: baseValue('pages.portal.enrol_new') })).toBeInTheDocument();
      expect(screen.getByText('Little Dancer')).toBeInTheDocument();
      expect(screen.getByText('Ballet 1')).toBeInTheDocument();
      expect(screen.getByText(baseValue('pages.portal.myself_dob_missing'))).toBeInTheDocument();
      // EnrolmentRow is main's again: no job payments / gallery card, even on a services preset.
      expect(screen.queryByTestId('gallery-card')).toBeNull();
      expect(screen.queryByText(baseValue('pages.client_portal.shoots_heading'))).toBeNull();
    });

    it('"Enrol new" still opens /enrol', () => {
      renderInApp(<PortalDashboard />, {
        path: '/dashboard/portal',
        extraRoutes: { '/enrol': <EnrolEntryRoute /> },
      });
      fireEvent.click(screen.getByRole('button', { name: baseValue('pages.portal.enrol_new') }));
      expect(screen.getByTestId('location').textContent).toBe('/enrol');
      expect(screen.getByText('DANCE ENROL FLOW')).toBeInTheDocument();
    });
  },
);

describe('PortalDashboard — photographer tenant renders ClientPortal', () => {
  beforeEach(() => setTenant('photographer'));

  it('shows shoots, contract, payments, gallery and details — no children / DOB / enrol', () => {
    renderInApp(<PortalDashboard />, { path: '/dashboard/portal' });

    const shoots = screen.getByRole('region', { name: 'My shoots' });
    expect(within(shoots).getByText('Wedding Gold')).toBeInTheDocument();
    expect(within(shoots).getByText('Jaffa Port')).toBeInTheDocument();
    expect(within(shoots).getByText(baseValue('pages.jobs.status_booked'))).toBeInTheDocument();

    const contract = screen.getByRole('region', { name: 'Contract' });
    expect(within(contract).getByText('Not signed yet')).toBeInTheDocument();
    expect(within(contract).getByRole('button', { name: 'Sign now' })).toBeInTheDocument();

    const payments = screen.getByRole('region', { name: 'Payments' });
    expect(within(payments).getByRole('link', { name: 'Receipt' })).toHaveAttribute('href', 'https://docs.example/r1');
    expect(within(payments).getByRole('button', { name: baseValue('pages.jobs.client_portal.pay') })).toBeInTheDocument();
    expect(within(payments).getByText('Paid')).toBeInTheDocument();

    const gallery = screen.getByRole('region', { name: 'Gallery' });
    expect(within(gallery).getByTestId('gallery-card').textContent).toBe('eng-shoot-1:gallery');

    const details = screen.getByRole('region', { name: 'My details' });
    expect(within(details).getByText('Pat Client')).toBeInTheDocument();
    expect(within(details).getByText('pat@example.com')).toBeInTheDocument();
    expect(within(details).getByText('+972501234567')).toBeInTheDocument();

    expect(screen.queryByText(baseValue('pages.portal.children_heading'))).toBeNull();
    expect(screen.queryByRole('button', { name: baseValue('pages.portal.add_child') })).toBeNull();
    expect(screen.queryByRole('button', { name: baseValue('pages.portal.enrol_new') })).toBeNull();
    expect(screen.queryByText(baseValue('pages.portal.myself_dob_missing'))).toBeNull();
    expect(screen.queryByText(new RegExp(baseValue('form.person.date_of_birth')))).toBeNull();
    const main = screen.getByRole('heading', { level: 2 }).closest('div.space-y-8') as HTMLElement;
    expect(main.textContent).not.toMatch(/child|enrol|class|student|waiver/i);
  });

  it('Sign now fetches a fresh signing link for that shoot and opens it', async () => {
    invoke.mockResolvedValue({ data: { signPath: '/enrol/complete?engagementId=eng-shoot-1&wt=abc' }, error: null });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: 'http://localhost' });
    try {
      renderInApp(<PortalDashboard />, { path: '/dashboard/portal' });
      fireEvent.click(screen.getByRole('button', { name: 'Sign now' }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/enrol/complete?engagementId=eng-shoot-1&wt=abc'));
      expect(invoke).toHaveBeenCalledWith('client-job-contract-link', { body: { engagementId: 'eng-shoot-1' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a signed contract shows Signed and no Sign now', () => {
    portal.client = clientData();
    portal.client.shoots[0].contractSigned = true;
    renderInApp(<PortalDashboard />, { path: '/dashboard/portal' });
    const contract = screen.getByRole('region', { name: 'Contract' });
    expect(within(contract).getByText('Signed')).toBeInTheDocument();
    expect(within(contract).queryByRole('button')).toBeNull();
  });

  it('no shoots yet: friendly empty state, still no child setup', () => {
    portal.client = { self: clientData().self, shoots: [], requests: [] };
    renderInApp(<PortalDashboard />, { path: '/dashboard/portal' });
    expect(screen.getByText(baseValue('pages.client_portal.no_shoots'))).toBeInTheDocument();
    expect(screen.queryByText(baseValue('pages.portal.myself_setup_cta'))).toBeNull();
  });

  it('Hebrew', async () => {
    await setLanguage('he');
    renderInApp(<PortalDashboard />, { path: '/dashboard/portal' });
    expect(screen.getByRole('region', { name: 'הצילומים שלי' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'לחתימה עכשיו' })).toBeInTheDocument();
  });
});

describe('DashboardRedirectPage', () => {
  const run = (state?: unknown) =>
    renderInApp(<DashboardRedirectPage />, {
      path: '/dashboard',
      initialEntry: { pathname: '/dashboard', state },
    });

  it.each<FakeTenantKind>(['dance', 'generic', 'none'])('%s: enrolment intent returns to /enrol', async (kind) => {
    setTenant(kind);
    run({ classId: 'class-1' });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/enrol'));
  });

  it('dance: account holder without intent → /dashboard/portal; admin → /admin/setup', async () => {
    setTenant('dance');
    const first = run();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/dashboard/portal'));
    first.unmount();
    auth.user = { ...auth.user, role: ['tenant_admin'] };
    run();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/setup'));
  });

  it('photographer: a class enrolment intent never reaches /enrol — the client goes to the portal', async () => {
    setTenant('photographer');
    sessionStorage.setItem('enrollmentIntent', JSON.stringify({ classId: 'class-1' }));
    run({ classId: 'class-1' });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/dashboard/portal'));
    expect(sessionStorage.getItem('enrollmentIntent')).toBeNull();
  });
});

describe('/enrol entry', () => {
  it.each<FakeTenantKind>(['dance', 'generic', 'none', 'beautician'])('%s: renders the dance enrolment flow', (kind) => {
    setTenant(kind);
    renderInApp(<EnrolEntryRoute />, { path: '/enrol' });
    expect(screen.getByText('DANCE ENROL FLOW')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/enrol');
  });

  it('photographer: redirects to /dashboard (→ client portal) without the guardian / child setup', () => {
    setTenant('photographer');
    renderInApp(<EnrolEntryRoute />, { path: '/enrol' });
    expect(screen.queryByText('DANCE ENROL FLOW')).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/dashboard');
  });
});

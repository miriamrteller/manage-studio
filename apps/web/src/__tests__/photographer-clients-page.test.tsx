// @vitest-environment jsdom
/**
 * /admin/people per vertical: photographers get a "Clients" page (Add client,
 * New shoot prefilled with the client, their shoots, no class/guardian UI);
 * dance tenants keep the Students page exactly as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { StudentsList } from '@/features/students/components/StudentsList';
import { StudentSlideOver } from '@/features/students/components/StudentSlideOver';
import { personPagePath } from '@/features/people/lib/personPagePath';
import { JobsList } from '@/features/jobs/components/JobsList';
import { Button } from '@/components/ui/button';
import type { JobRow } from '@/features/jobs/services/jobService';
import { baseValue, renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const PERSON = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Dana Levi',
  email: 'dana@example.com',
  status: 'active',
  account_id: 'acc-1',
  date_of_birth: '2015-05-01',
  emergency_contact_name: null,
  emergency_contact_phone: null,
};

const state = vi.hoisted(() => ({
  jobs: [] as unknown[],
  useJobsCalls: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock('@/features/students/hooks/useStudents', () => ({
  useStudents: () => ({ students: [PERSON], total: 1, pageSize: 25, isLoading: false, error: null }),
}));
vi.mock('@/features/students/hooks/useStudentDetail', () => ({
  useStudentDetail: () => ({
    person: PERSON,
    family: { id: 'acc-1' },
    guardian: { name: 'Parent Name', email: 'p@example.com', emergency_contact_phone: null },
    members: [],
    contactPrefs: null,
    enrolments: [],
    engagementRecords: [],
    offerings: [],
    payments: [],
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/features/classes/hooks/useClasses', () => ({
  useClasses: () => ({ classes: [{ id: 'c1', name: 'Ballet 1' }] }),
}));
vi.mock('@/features/levels/hooks/useLevels', () => ({
  useLevels: () => ({ levels: [{ id: 'l1', name: 'Beginner' }] }),
}));
vi.mock('@/features/families/components/FamilyMultiSelect', () => ({
  FamilyMultiSelect: () => <div>family-filter</div>,
}));
vi.mock('@/features/enrolment/components/AdminEnrolStudentModal', () => ({
  AdminEnrolStudentModal: ({ isOpen, personName }: { isOpen: boolean; personName: string }) =>
    isOpen ? <div role="dialog">enrol-modal:{personName}</div> : null,
}));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobs: (options?: { enabled?: boolean }) => {
    state.useJobsCalls.push(options);
    return {
      jobs: options?.enabled === false ? [] : state.jobs,
      isLoading: false,
      error: null,
      createJob: vi.fn(),
      isCreating: false,
    };
  },
  useJobPackages: () => ({ data: [] }),
}));
// Every TenantDB list query on the page resolves to an empty result.
vi.mock('@/lib/db', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['in', 'eq', 'select', 'order', 'limit', 'range']) chain[m] = self;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return { TenantDB: { selectFor: () => chain } };
});

const SHOOT = {
  engagement_id: 'eng-1',
  person_id: PERSON.id,
  package_name: 'Wedding Full Day',
  job_status: 'booked',
  booked_starts_at: null,
  client_name: PERSON.name,
} as unknown as JobRow;

const jobsRoute = { '/admin/projects': <JobsList /> };

function renderList() {
  return renderInApp(<StudentsList />, { path: '/admin/people', extraRoutes: jobsRoute });
}

beforeEach(async () => {
  state.jobs = [SHOOT];
  state.useJobsCalls = [];
  await setLanguage('en');
});

describe('Clients page (photographer)', () => {
  beforeEach(() => setTenant('photographer'));

  it('shows Add client / New shoot and the client’s shoots, no dance wording', async () => {
    renderList();
    expect(await screen.findByRole('button', { name: 'Add client' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New shoot' })).toBeInTheDocument();
    expect(screen.queryByText(/enrol/i)).toBeNull();
    expect(screen.queryByText(baseValue('pages.students.guardian_column'))).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Shoots' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wedding Full Day' })).toHaveAttribute('href', '/admin/projects/eng-1');
  });

  it('has no class, level, family or age filters', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: /filters/i }));
    expect(screen.queryByText(baseValue('pages.students.filter_by_class'))).toBeNull();
    expect(screen.queryByText(baseValue('pages.students.filter_by_level'))).toBeNull();
    expect(screen.queryByText('family-filter')).toBeNull();
    expect(screen.getByText('Booking status')).toBeInTheDocument();
  });

  it('New shoot opens the create form prefilled with that client (not /enrol)', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'New shoot' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/projects');
    const form = await screen.findByRole('form', { name: 'New shoot' });
    expect(within(form).getByRole('radio', { name: 'Existing client' })).toBeChecked();
    expect(within(form).getByText(PERSON.name, { selector: 'strong' })).toBeInTheDocument();
  });

  it('Add client opens the create form on “New client”', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Add client' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/projects');
    const form = await screen.findByRole('form', { name: 'New shoot' });
    expect(within(form).getByRole('radio', { name: 'New client' })).toBeChecked();
  });

  it('expanded row lists shoots and has no guardian / "not enrolled" wording', async () => {
    state.jobs = [];
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: baseValue('pages.students.expand_row') }));
    expect(screen.queryByText(baseValue('pages.students.contact_section_guardian'))).toBeNull();
    expect(screen.queryByText(baseValue('pages.students.no_classes'))).toBeNull();
    expect(screen.getAllByText('No shoots yet').length).toBeGreaterThan(0);
    // Both the row action and the expanded-row action are "New shoot".
    expect(screen.getAllByRole('button', { name: 'New shoot' })).toHaveLength(2);
  });

  it('Hebrew wording', async () => {
    await setLanguage('he');
    renderList();
    expect(await screen.findByRole('button', { name: 'הוספת לקוח' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'לקוחות' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'צילום חדש' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'צילומים' })).toBeInTheDocument();
    expect(screen.queryByText(baseValue('pages.students.enrol_button', 'he'))).toBeNull();
    expect(screen.queryByText(baseValue('pages.students.enrol_new_button', 'he'))).toBeNull();
    expect(screen.queryByText(baseValue('pages.students.guardian_column', 'he'))).toBeNull();
  });

  it('slide-over: shoots + New shoot, no enrolments or Parent / Guardian section', async () => {
    renderInApp(<StudentSlideOver personId={PERSON.id} onClose={() => {}} />, {
      path: '/admin/people',
      extraRoutes: jobsRoute,
    });
    expect(await screen.findByRole('heading', { name: 'Shoots' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Client details' })).toBeInTheDocument();
    expect(screen.queryByText(baseValue('pages.people.detail_title'))).toBeNull();
    expect(screen.getByRole('link', { name: 'Wedding Full Day' })).toHaveAttribute('href', '/admin/projects/eng-1');
    expect(screen.queryByText(baseValue('pages.students.contact_section_guardian'))).toBeNull();
    expect(screen.queryByText(baseValue('pages.students.enrolments_section'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New shoot' }));
    const form = await screen.findByRole('form', { name: 'New shoot' });
    expect(within(form).getByText(PERSON.name, { selector: 'strong' })).toBeInTheDocument();
  });
});

describe("A person's own page", () => {
  beforeEach(() => setTenant('photographer'));

  it('shows everything about the client as a page, with the shoot linked and a way back', async () => {
    const onClose = vi.fn();
    renderInApp(<StudentSlideOver personId={PERSON.id} onClose={onClose} variant="page" />, {
      path: '/admin/people/:personId',
      initialEntry: `/admin/people/${PERSON.id}`,
      extraRoutes: jobsRoute,
    });
    expect(await screen.findByRole('heading', { level: 1, name: PERSON.name })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('link', { name: 'Wedding Full Day' })).toHaveAttribute('href', '/admin/projects/eng-1');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('the side panel offers the full page', async () => {
    renderInApp(<StudentSlideOver personId={PERSON.id} onClose={() => {}} />, {
      path: '/admin/people',
      extraRoutes: jobsRoute,
    });
    expect(await screen.findByRole('button', { name: 'Open full page' })).toBeInTheDocument();
  });

  it('the page address is /admin/people/<person>', () => {
    expect(personPagePath('p-1')).toBe('/admin/people/p-1');
  });
});

describe('Students page (dance) is unchanged', () => {
  beforeEach(() => setTenant('dance'));

  it('keeps Enrol new student → /enrol and the per-row Enrol in class', async () => {
    renderList();
    const enrolNew = await screen.findByRole('button', { name: 'Enrol new student' });
    expect(screen.getByRole('heading', { level: 1, name: 'Students' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enrol in class' })).toBeInTheDocument();
    expect(screen.queryByText('Add client')).toBeNull();
    expect(screen.queryByText('New shoot')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Guardian' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Classes' })).toBeInTheDocument();
    // No shoots list fetch for dance tenants.
    expect(state.useJobsCalls.every((call) => call?.enabled === false)).toBe(true);
    fireEvent.click(enrolNew);
    expect(screen.getByTestId('location')).toHaveTextContent('/enrol');
  });

  it('row Enrol in class opens the class enrolment modal', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Enrol in class' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(`enrol-modal:${PERSON.name}`);
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/people');
  });

  it('keeps the class, level and family filters', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: /filters/i }));
    expect(screen.getByText('Filter by class:')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('family-filter')).toBeInTheDocument();
  });

  it('expanded row keeps "Not enrolled in any classes" + Enrol in class', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Expand row' }));
    expect(screen.getByText('Not enrolled in any classes')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Enrol in class' })).toHaveLength(2);
  });

  it('slide-over keeps Enrolments and Parent / Guardian', async () => {
    renderInApp(<StudentSlideOver personId={PERSON.id} onClose={() => {}} />, { path: '/admin/people' });
    expect(await screen.findByRole('heading', { name: 'Enrolments' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Parent / Guardian' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enrol in class' })).toBeInTheDocument();
  });
});

describe('Button sizes', () => {
  it('small buttons never wrap their label and have no fixed width/height', () => {
    renderInApp(<Button size="sm">Enrol in class</Button>);
    const button = screen.getByRole('button', { name: 'Enrol in class' });
    expect(button.className).toContain('whitespace-nowrap');
    expect(button.className).not.toMatch(/(^|\s)(w|h|size)-\d/);
  });
});

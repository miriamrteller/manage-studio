// @vitest-environment jsdom
/**
 * Prefill PR B: forms a signed-in person fills start from what OpalSwift already
 * knows (name and email from their profile, phone from get_my_last_signer_details,
 * which falls back to their own stored number). Only empty fields are filled,
 * typed values are kept, and every field stays editable.
 *
 *   row 3  WaiverStep signer details (fillEmptySignerFields; render case in waiver-signer-details.test.tsx)
 *   row 4  GuardianProfileSetupPanel (first-time parent profile)
 *   row 5  StepSelectStudent: signed-in parent with no family -> new-family form
 *   row 18 BookingPage details
 *   row 19 InquiryForm (enquiry / named form)
 *
 * Run: pnpm -C apps/web test prefill-enrolment
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; full_name?: string; tenant_id: string; role: string[] },
  rpc: vi.fn(),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: h.user, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(),
  },
}));
vi.mock('@/hooks/useTenant', () => {
  const tenant = { id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet', vertical: 'dance-studio' };
  return { useTenant: () => tenant, useTenantQuery: () => ({ tenant, isLoading: false, notFound: false }) };
});
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 'creativeballet' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/features/crm/hooks/useLeadFormQuestions', () => ({ useLeadFormQuestions: () => ({ questions: [] }) }));
vi.mock('@/features/scheduling/hooks/useIsNarrowViewport', () => ({ useIsNarrowViewport: () => false }));
vi.mock('@/features/scheduling/bookingService', () => ({
  BookingService: {
    listBookableOfferings: async () => [
      { id: 'off-1', name: 'Private lesson', duration_mins: 60, price_minor: 10000, currency: 'ILS' },
    ],
  },
}));
vi.mock('@/features/scheduling/components/BookingCalendar', () => ({
  BookingCalendar: ({ onSelectSlot }: { onSelectSlot: (s: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onSelectSlot({ starts_at: '2026-12-01T10:00:00Z', ends_at: '2026-12-01T11:00:00Z' })}
    >
      pick slot
    </button>
  ),
}));

import i18n from '@/i18n/i18n';
import { EMPTY_SIGNER_DRAFT } from '@/features/enrolment/components/SignerDetailsForm';
import { fillEmptySignerFields } from '@/features/enrolment/components/WaiverStep';
import { GuardianProfileSetupPanel } from '@/features/enrolment/components/GuardianProfileSetupPanel';
import { StepSelectStudent } from '@/features/enrolment/components/StepSelectStudent';
import { InquiryForm } from '@/features/crm/components/InquiryForm';
import BookingPage from '@/pages/BookingPage';

const PARENT = {
  id: 'u-1',
  email: 'dana@example.com',
  full_name: 'Dana Levi',
  tenant_id: 't-1',
  role: ['account_holder'],
};

function renderIt(ui: ReactElement, url = '/') {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.user = PARENT;
  h.rpc.mockResolvedValue({ data: { phone: '052-765-4321' }, error: null });
});
afterEach(() => {
  cleanup();
  h.rpc.mockReset();
});

describe('row 3: signer details fill field by field', () => {
  it('a phone-only result (stored number, never signed) fills just the phone', () => {
    const d = fillEmptySignerFields({ ...EMPTY_SIGNER_DRAFT }, { phone: '052-765-4321' });
    expect(d).toEqual({ ...EMPTY_SIGNER_DRAFT, phone: '052-765-4321' });
  });

  it('never overwrites typed values; empty fields still fill', () => {
    const typed = { ...EMPTY_SIGNER_DRAFT, idType: 'passport' as const, idNumber: 'AB123', phone: '050-000-0000' };
    const d = fillEmptySignerFields(typed, {
      id_type: 'israeli_id',
      id_number: '123456782',
      phone: '052-765-4321',
      address: '1 Herzl St, Haifa',
    });
    expect(d.idType).toBe('passport');
    expect(d.idNumber).toBe('AB123');
    expect(d.phone).toBe('050-000-0000');
    expect(d.address).toBe('1 Herzl St, Haifa');
  });

  it('a full last block fills everything when nothing is typed', () => {
    const d = fillEmptySignerFields({ ...EMPTY_SIGNER_DRAFT }, {
      id_type: 'passport',
      id_number: 'AB1234567',
      passport_country: 'France',
      phone: '+33 1 23 45 67 89',
      address: '1 Rue de Rivoli, Paris',
    });
    expect(d).toMatchObject({ idType: 'passport', idNumber: 'AB1234567', passportCountry: 'France', phone: '+33 1 23 45 67 89' });
  });
});

describe('row 4: first-time parent profile', () => {
  function renderPanel(defaultName = '') {
    return renderIt(
      <GuardianProfileSetupPanel
        mode="create"
        defaultName={defaultName}
        accountId="acc-1"
        accountMemberId="m-1"
        onComplete={() => undefined}
      />,
    );
  }

  it('starts from the signed-in parent\'s name and stored phone, and both stay editable', async () => {
    renderPanel();
    const name = screen.getByLabelText('Full Name');
    const phone = screen.getByLabelText('Phone');
    await waitFor(() => expect(name).toHaveValue('Dana Levi'));
    await waitFor(() => expect(phone).toHaveValue('052-765-4321'));
    expect(h.rpc).toHaveBeenCalledWith('get_my_last_signer_details');
    fireEvent.change(name, { target: { value: 'Dana L.' } });
    fireEvent.change(phone, { target: { value: '' } });
    expect(name).toHaveValue('Dana L.');
    expect(phone).toHaveValue('');
  });

  it('keeps a name it was given and a phone typed before the lookup answered', async () => {
    let answer: (v: unknown) => void = () => undefined;
    h.rpc.mockReturnValue(new Promise((r) => { answer = r; }));
    renderPanel('Family Name On File');
    const phone = screen.getByLabelText('Phone');
    fireEvent.change(phone, { target: { value: '054-111-2222' } });
    answer({ data: { phone: '052-765-4321' }, error: null });
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText('Full Name')).toHaveValue('Family Name On File');
    expect(phone).toHaveValue('054-111-2222');
  });

  it('with no stored phone the phone stays empty and nothing blocks the form', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveValue('Dana Levi'));
    expect(screen.getByLabelText('Phone')).toHaveValue('');
    expect(screen.getByRole('button', { name: i18n.t('pages.enrolment.guardian_setup_submit') })).toBeEnabled();
  });
});

describe('row 5: signed-in parent with no family goes to the new-family form', () => {
  function renderStep() {
    return renderIt(
      <StepSelectStudent
        mode="parent"
        constraints={{} as never}
        guardian={null}
        students={[]}
        guardianPersonId={null}
        studentsLoading={false}
        studentsError={null}
        onSelectPerson={() => undefined}
        onCreateMinor={async () => undefined}
        onCreateAdult={async () => undefined}
        onCreateMinorWithGuardian={async () => undefined}
      />,
    );
  }

  it('the guardian section starts with the parent\'s name, email and phone', async () => {
    renderStep();
    // Let the phone lookup answer before opening the form.
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('get_my_last_signer_details'));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Create new student with guardian' }));
    const guardian = screen.getByRole('group', { name: i18n.t('pages.enrolment.guardian_section') });
    const name = guardian.querySelector('input[type="text"]') as HTMLInputElement;
    const email = guardian.querySelector('input[type="email"]') as HTMLInputElement;
    const phone = guardian.querySelector('input[type="tel"]') as HTMLInputElement;
    expect(name).toHaveValue('Dana Levi');
    expect(email).toHaveValue('dana@example.com');
    expect(phone).toHaveValue('052-765-4321');
    expect(name).toHaveAccessibleName('Full Name');
    fireEvent.change(email, { target: { value: 'other@example.com' } });
    expect(email).toHaveValue('other@example.com');
  });
});

describe('row 18: public booking page', () => {
  async function openDetails() {
    renderIt(<BookingPage />, '/book');
    fireEvent.click(await screen.findByRole('button', { name: 'pick slot' }));
    await screen.findByText(i18n.t('scheduling.book.your_details'));
  }

  it('signed in: name, email and phone start filled and stay editable', async () => {
    await openDetails();
    const name = screen.getByLabelText(i18n.t('scheduling.book.name'));
    await waitFor(() => expect(name).toHaveValue('Dana Levi'));
    expect(screen.getByLabelText(i18n.t('scheduling.book.email'))).toHaveValue('dana@example.com');
    await waitFor(() => expect(screen.getByLabelText(i18n.t('scheduling.book.phone'))).toHaveValue('052-765-4321'));
    fireEvent.change(name, { target: { value: 'Someone Else' } });
    expect(name).toHaveValue('Someone Else');
  });

  it('signed out: the details start blank and no lookup is made', async () => {
    h.user = null;
    await openDetails();
    expect(screen.getByLabelText(i18n.t('scheduling.book.name'))).toHaveValue('');
    expect(screen.getByLabelText(i18n.t('scheduling.book.email'))).toHaveValue('');
    expect(screen.getByLabelText(i18n.t('scheduling.book.phone'))).toHaveValue('');
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('row 19: enquiry / named form', () => {
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;

  it('signed in: name, email and phone start filled', async () => {
    renderIt(<InquiryForm />, '/inquire');
    await waitFor(() => expect(field('inquire-name')).toHaveValue('Dana Levi'));
    expect(field('inquire-email')).toHaveValue('dana@example.com');
    await waitFor(() => expect(field('inquire-phone')).toHaveValue('052-765-4321'));
  });

  it('URL parameters never fill the contact fields', async () => {
    h.user = null;
    renderIt(<InquiryForm />, '/inquire?name=Eve&email=eve%40x.test&phone=0501234567');
    await new Promise((r) => setTimeout(r, 0));
    expect(field('inquire-name')).toHaveValue('');
    expect(field('inquire-email')).toHaveValue('');
    expect(field('inquire-phone')).toHaveValue('');
  });

  it('a value typed before the profile arrives is kept', async () => {
    let answer: (v: unknown) => void = () => undefined;
    h.rpc.mockReturnValue(new Promise((r) => { answer = r; }));
    renderIt(<InquiryForm />, '/inquire');
    fireEvent.change(field('inquire-phone'), { target: { value: '054-111-2222' } });
    answer({ data: { phone: '052-765-4321' }, error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(field('inquire-phone')).toHaveValue('054-111-2222');
  });
});

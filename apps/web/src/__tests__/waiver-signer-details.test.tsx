// @vitest-environment jsdom
/**
 * The signing step collects the signer's details (ID or passport, phone, address, and for a minor
 * the child's name and date of birth), a "These details are correct" tick, and sends them with
 * the signature. Nothing is sent until the details are valid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { renderInApp, setTenant } from './helpers/verticalHarness';
import { fillSignerDetails } from './helpers/signerDetails';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const invoke = vi.fn();
const rpc = vi.fn();
const currentUser = vi.hoisted(() => ({ value: null as { full_name: string } | null }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: currentUser.value, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    rpc: (...args: unknown[]) => rpc(...args),
    from: vi.fn(),
  },
}));

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

const TEMPLATE = { id: '11111111-1111-4111-8111-111111111111', version: 1, name: 'Health declaration', content: 'Terms', language: null };

function acceptCalls() {
  return invoke.mock.calls.filter((c) => c[0] === 'accept-waiver');
}

function renderStep(props: { isMinorStudent?: boolean; studentDateOfBirth?: string | null; studentName?: string } = {}) {
  return renderInApp(
    <WaiverStep
      personId="22222222-2222-4222-8222-222222222222"
      template={TEMPLATE}
      offeringId="33333333-3333-4333-8333-333333333333"
      tenantIdForInvalidation="t1"
      onComplete={() => undefined}
      onPrevious={() => undefined}
      canGoBack={false}
      {...props}
    />,
  );
}

async function readAndName() {
  fireEvent.click(await screen.findByRole('checkbox', { name: 'I have read and accept this health declaration' }));
  fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Dana Levi' } });
}

beforeEach(() => {
  setTenant('dance');
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  rpc.mockResolvedValue({ data: null, error: null });
  invoke.mockImplementation(async (name: string) =>
    name === 'waiver-viewed'
      ? { data: { view_token: 'vt', viewed_at_ts: Math.floor(Date.now() / 1000) }, error: null }
      : { data: { evidence_id: 'ev-1' }, error: null },
  );
});
afterEach(() => {
  currentUser.value = null;
  vi.unstubAllGlobals();
  invoke.mockReset();
  rpc.mockReset();
});

describe('signer details on the signing step', () => {
  it('keeps Sign off until the "These details are correct" tick is ticked', async () => {
    renderStep();
    await readAndName();
    const sign = screen.getByRole('button', { name: 'Sign and Continue' });
    expect(sign).toBeDisabled();
    fillSignerDetails();
    expect(sign).toBeEnabled();
  });

  it('sends the details with the signature (ID normalised on the server, as typed here)', async () => {
    renderStep();
    await readAndName();
    fillSignerDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    const body = acceptCalls()[0][1].body;
    expect(body.signer_details.signer).toMatchObject({
      full_name: 'Dana Levi',
      id_type: 'israeli_id',
      id_number: '123456782',
      phone: '050-123-4567',
      address: '1 Herzl St, Haifa',
    });
    expect(body.signer_details.confirmed).toBe(true);
    expect(body.signer_details.confirmed_wording).toBe('These details are correct');
    expect(body.signer_details.child).toBeUndefined();
  });

  it('does not send anything for an ID with a wrong check digit, and says why', async () => {
    renderStep();
    await readAndName();
    fillSignerDetails();
    fireEvent.change(screen.getByLabelText('ID number (teudat zehut)', { exact: false }), { target: { value: '123456789' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));
    expect(await screen.findByText('This ID number is not valid. Please check the digits.')).toBeInTheDocument();
    expect(screen.getByLabelText('ID number (teudat zehut)', { exact: false })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('ID number (teudat zehut)', { exact: false })).toHaveFocus();
    expect(acceptCalls()).toHaveLength(0);
  });

  it('"I don\'t have an Israeli ID" asks for a passport number and its country', async () => {
    renderStep();
    await readAndName();
    fillSignerDetails();
    fireEvent.click(screen.getByRole('checkbox', { name: "I don't have an Israeli ID" }));
    fireEvent.change(screen.getByLabelText('Passport number'), { target: { value: 'ab 1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));
    expect(await screen.findByText('Enter the country that issued the passport.')).toBeInTheDocument();
    expect(acceptCalls()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Country that issued the passport'), { target: { value: 'France' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    expect(acceptCalls()[0][1].body.signer_details.signer).toMatchObject({
      id_type: 'passport',
      id_number: 'ab 1234567',
      passport_country: 'France',
    });
  });

  it('for a minor, asks for the child\'s name and date of birth (pre-filled from the student) and sends them', async () => {
    renderStep({ isMinorStudent: true, studentName: 'Noa Levi', studentDateOfBirth: '2016-01-02' });
    await readAndName();
    expect(screen.getByLabelText("Child's full name")).toHaveValue('Noa Levi');
    expect(screen.getByLabelText("Child's date of birth")).toHaveValue('2016-01-02');
    fireEvent.click(screen.getByRole('checkbox', { name: /parent or guardian|confirm/i }));
    fillSignerDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Sign and Continue' }));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    expect(acceptCalls()[0][1].body.signer_details.child).toEqual({ full_name: 'Noa Levi', date_of_birth: '2016-01-02' });
  });

  it('asks for no child block for an adult', async () => {
    renderStep();
    await readAndName();
    expect(screen.queryByLabelText("Child's full name")).toBeNull();
  });

  it('pre-fills from the signer\'s last signed form without overwriting what they typed', async () => {
    rpc.mockResolvedValue({
      data: { full_name: 'Dana Levi', id_type: 'israeli_id', id_number: '123456782', phone: '050-123-4567', address: '1 Herzl St, Haifa' },
      error: null,
    });
    renderStep();
    await readAndName();
    await waitFor(() => expect(screen.getByLabelText('Phone number')).toHaveValue('050-123-4567'));
    expect(screen.getByLabelText('ID number (teudat zehut)', { exact: false })).toHaveValue('123456782');
    expect(rpc).toHaveBeenCalledWith('get_my_last_signer_details');
  });

  it('with no earlier signed form, the signature name is the signed-in person (editable)', async () => {
    currentUser.value = { full_name: 'Dana Levi' };
    renderStep();
    await waitFor(() => expect(screen.getByLabelText('Full legal name')).toHaveValue('Dana Levi'));
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Dana Cohen' } });
    expect(screen.getByLabelText('Full legal name')).toHaveValue('Dana Cohen');
  });

  it('the name from an earlier signed form wins over the account name', async () => {
    currentUser.value = { full_name: 'Dana Levi' };
    rpc.mockResolvedValue({ data: { full_name: 'Dana Levi-Cohen', phone: '050-1234567' }, error: null });
    renderStep();
    await waitFor(() => expect(screen.getByLabelText('Full legal name')).toHaveValue('Dana Levi-Cohen'));
  });

  it('a guest link (no session) does not ask for a pre-fill', async () => {
    renderInApp(
      <WaiverStep
        personId="22222222-2222-4222-8222-222222222222"
        template={TEMPLATE}
        offeringId="33333333-3333-4333-8333-333333333333"
        waiverToken="guest-token"
        onComplete={() => undefined}
        onPrevious={() => undefined}
        canGoBack={false}
      />,
    );
    await screen.findByRole('checkbox', { name: 'I have read and accept this health declaration' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

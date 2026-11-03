// @vitest-environment jsdom
/**
 * The admin sees the full signer details only in the "Signed details" dialog; opening it is
 * written to the audit log. Lists never select the sensitive column.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import '@/i18n/i18n';
import { SignedDetailsDialog } from '@/features/waivers/components/SignedDetailsDialog';
import { WAIVER_EVIDENCE_LIST_COLUMNS } from '@/features/waivers/service';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const DETAILS = {
  version: 1,
  confirmed: true,
  confirmed_wording: 'These details are correct',
  signer: { full_name: 'Dana Levi', id_type: 'israeli_id', id_number: '123456782', phone: '050-123-4567', address: '1 Herzl St, Haifa' },
  child: { full_name: 'Noa Levi', date_of_birth: '2016-01-02', dob_differs_from_profile: true },
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignedDetailsDialog evidenceId="ev-1" signerName="Dana Levi" onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === 'get_signed_record_details' ? { data: DETAILS, error: null } : { data: null, error: null },
  );
});

describe('SignedDetailsDialog', () => {
  it('shows the full ID, phone, address, child and the date-of-birth warning, and logs the view', async () => {
    renderDialog();
    expect(await screen.findByText('123456782')).toBeInTheDocument();
    expect(screen.getByText('050-123-4567')).toBeInTheDocument();
    expect(screen.getByText('1 Herzl St, Haifa')).toBeInTheDocument();
    expect(screen.getByText('Noa Levi')).toBeInTheDocument();
    expect(screen.getByText('2016-01-02')).toBeInTheDocument();
    expect(screen.getByText(/different from the one on the child's profile/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('log_sensitive_read', { p_entity_type: 'waiver_evidence', p_entity_id: 'ev-1' });
    expect(rpc).toHaveBeenCalledWith('get_signed_record_details', { p_evidence_id: 'ev-1' });
  });

  it('says so for a form signed before signer details were collected', async () => {
    rpc.mockImplementation(async () => ({ data: null, error: null }));
    renderDialog();
    expect(await screen.findByText('This form was signed before signer details were collected.')).toBeInTheDocument();
  });

  it('shows a passport with its country', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'get_signed_record_details'
        ? { data: { ...DETAILS, child: undefined, signer: { ...DETAILS.signer, id_type: 'passport', id_number: 'AB1234567', passport_country: 'France' } }, error: null }
        : { data: null, error: null },
    );
    renderDialog();
    expect(await screen.findByText('AB1234567')).toBeInTheDocument();
    expect(screen.getByText('Passport number')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('France')).toBeInTheDocument());
  });
});

describe('admin list columns', () => {
  it('never names signer_details and never uses a star', () => {
    expect(WAIVER_EVIDENCE_LIST_COLUMNS).not.toContain('signer_details');
    expect(WAIVER_EVIDENCE_LIST_COLUMNS).not.toContain('*');
    expect(WAIVER_EVIDENCE_LIST_COLUMNS).toContain('signer_id_masked');
  });
});

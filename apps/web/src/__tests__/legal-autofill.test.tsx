// @vitest-environment jsdom
/**
 * Settings → Legal asks only for what we don't already know: the studio's
 * name, contact email, owner, payment and invoicing providers and season fill
 * the details (editable); the providers and business email aren't asked at
 * all. Season details may still be open when confirming the legal pack (the
 * draft says "to be completed") but not when publishing. Prices are never
 * filled in: they belong to each class.
 * Run: pnpm -C apps/web test legal-autofill.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  profile: {} as Record<string, string>,
  updates: [] as Array<Record<string, unknown>>,
  tenantRow: { payment_provider: 'grow', invoicing_provider: 'icount', offline_payment_instructions: '' } as Record<string, string>,
  seasons: [{ name: '2026–2027', start_date: '2026-09-01', end_date: '2027-06-30', status: 'active' }] as Array<Record<string, string>>,
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u-1', tenant_id: 't-1', full_name: 'Dana Levi' }, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/hooks/useTenant', () => {
  const tenant = { id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet' };
  return { useTenant: () => tenant, useTenantQuery: () => ({ tenant, isLoading: false, notFound: false }) };
});
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    from: (table: string) => {
      let single = false;
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        maybeSingle: () => {
          single = true;
          return q;
        },
        update: (v: Record<string, unknown>) => {
          h.updates.push(v);
          if (v.legal_profile) h.profile = v.legal_profile as Record<string, string>;
          return q;
        },
        then: (r: (v: unknown) => unknown) =>
          r({
            data:
              table === 'tenants'
                ? single
                  ? h.tenantRow
                  : null
                : table === 'seasons'
                  ? h.seasons
                  : [{ lawyer_reviewed_at: null }],
            error: null,
          }),
      };
      return q;
    },
  },
}));

import i18n from '@/i18n/i18n';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';
import { LegalSettingsForm } from '@/features/settings/components/LegalSettingsForm';
import { legalAutofill, withLegalAutofill } from '@/legal/autofill';
import { missingLegalDetails } from '@/legal/fields';
import { loadLegalTemplate } from '@/legal/templates';
import { prepareLegalMarkdown, renderLegalHtml } from '@/legal/render';

function profileRow() {
  return {
    tenant_id: 't-1',
    name: 'Creative Ballet',
    contact_email: 'info@creativeballet.test',
    skin: 'dance-studio',
    legal_profile: h.profile,
    legal_pages_published: false,
    legal_profile_updated_at: null,
    legal_pack_required: true,
    legal_pack_acknowledged_at: null,
    language_default: 'en',
  };
}

/** What the studio still types itself (nothing we can know). */
const TYPED: Record<string, string> = {
  address: '1 Herzl St, Tel Aviv',
  phone: '050-1234567',
  lesson_count: '34',
  season_price: '3,000',
  monthly_price: '300',
  month_count: '10',
  payment_dates: 'on the 1st of each month',
  insurance: 'third-party liability insurance',
};

function wrap(ui: ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.profile = {};
  h.updates = [];
  h.tenantRow = { payment_provider: 'grow', invoicing_provider: 'icount', offline_payment_instructions: '' };
  h.seasons = [{ name: '2026–2027', start_date: '2026-09-01', end_date: '2027-06-30', status: 'active' }];
  h.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_tenant_legal_profile') return { data: [profileRow()], error: null };
    if (name === 'acknowledge_studio_legal_pack') return { data: '2026-11-02T12:00:00Z', error: null };
    return { data: [], error: null };
  });
});
afterEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('legalAutofill', () => {
  const src = {
    tenantName: 'Creative Ballet',
    contactEmail: 'info@creativeballet.test',
    ownerName: 'Dana Levi',
    paymentProvider: 'grow',
    invoicingProvider: 'icount',
    offlinePayments: true,
    season: { name: '2026–2027', start_date: '2026-09-01', end_date: '2027-06-30' },
  };

  it('fills what the studio already gave us, in English and Hebrew', () => {
    expect(legalAutofill(src, 'en')).toEqual({
      legal_name: 'Creative Ballet',
      email: 'info@creativeballet.test',
      privacy_contact_email: 'info@creativeballet.test',
      accessibility_contact_email: 'info@creativeballet.test',
      privacy_contact_name: 'Dana Levi',
      accessibility_contact_name: 'Dana Levi',
      payment_providers: 'Grow, iCount',
      payment_methods: "card through the payment page (Grow); bank transfer or cash, as the studio's payment instructions say",
      season_name: '2026–2027',
      season_start: '2026-09-01',
      season_end: '2027-06-30',
    });
    expect(legalAutofill(src, 'he').payment_methods).toBe(
      'כרטיס אשראי בעמוד התשלום (Grow); העברה בנקאית או מזומן, לפי הנחיות הסטודיו',
    );
  });

  it('never fills prices or anything about a class', () => {
    const keys = Object.keys(legalAutofill(src, 'en'));
    for (const k of ['season_price', 'monthly_price', 'month_count', 'lesson_count', 'registration_fee']) {
      expect(keys).not.toContain(k);
    }
  });

  it('a pay-at-the-studio studio says so', () => {
    const out = legalAutofill({ ...src, paymentProvider: 'offline', invoicingProvider: 'none' }, 'en');
    expect(out.payment_providers).toBe('payments are made directly to the studio');
    expect(out.payment_methods).toBe("bank transfer or cash, as the studio's payment instructions say");
  });

  it('what the studio typed wins over a suggestion', () => {
    expect(withLegalAutofill({ legal_name: 'CBA Ltd', phone: '' }, { legal_name: 'Creative Ballet', phone: 'x' })).toEqual({
      legal_name: 'CBA Ltd',
      phone: 'x',
    });
  });
});

describe('one missing list for Confirm and Publish', () => {
  const filled = withLegalAutofill(TYPED, legalAutofill({ tenantName: 'CB', contactEmail: 'a@b.c', ownerName: 'Dana', paymentProvider: 'grow' }, 'en'));

  it('season details may wait for Confirm, not for Publish', () => {
    expect(missingLegalDetails('dance-studio', filled, 'confirm')).toEqual([]);
    expect(missingLegalDetails('dance-studio', filled, 'publish').map((f) => f.key)).toEqual([
      'season_name',
      'season_start',
      'season_end',
    ]);
  });

  it('prices are still the studio\'s to give', () => {
    const rest = { ...filled };
    delete rest.season_price;
    expect(missingLegalDetails('dance-studio', rest, 'confirm').map((f) => f.key)).toEqual(['season_price']);
  });

  it('an open detail shows as "to be completed" in the draft', async () => {
    const raw = await loadLegalTemplate('enrolment-terms', 'en');
    const out = prepareLegalMarkdown(raw, {
      doc: 'enrolment-terms',
      lang: 'en',
      vertical: 'dance-studio',
      tenantName: 'CB',
      contactEmail: 'a@b.c',
      profile: filled,
      updatedAt: null,
    });
    expect(renderLegalHtml(out)).toContain('[Season name – to be completed]');
    const rawHe = await loadLegalTemplate('enrolment-terms', 'he');
    const he = prepareLegalMarkdown(rawHe, {
      doc: 'enrolment-terms',
      lang: 'he',
      vertical: 'dance-studio',
      tenantName: 'CB',
      contactEmail: 'a@b.c',
      profile: filled,
      updatedAt: null,
    });
    expect(renderLegalHtml(he)).toContain('[שם העונה – להשלמה]');
  });
});

describe('Settings → Legal', () => {
  it('pre-fills known details (editable, marked) and does not ask for providers or the business email', async () => {
    wrap(<LegalSettingsForm />);
    const name = await screen.findByLabelText(/Legal name of the business/);
    await waitFor(() => expect(name).toHaveValue('Creative Ballet'));
    expect(screen.getByLabelText(/Privacy contact email/)).toHaveValue('info@creativeballet.test');
    expect(screen.getByLabelText(/Privacy contact \(name or role\)/)).toHaveValue('Dana Levi');
    expect(screen.getByLabelText(/Season name/)).toHaveValue('2026–2027');
    expect(screen.getAllByText("Filled in from your studio's details. Check it and change it if needed.").length).toBeGreaterThan(3);
    expect(screen.queryByLabelText(/Payment and invoicing providers/)).toBeNull();
    expect(screen.queryByLabelText(/Business email/)).toBeNull();
    expect(screen.getByLabelText(/Price for the season/)).toHaveValue('');

    fireEvent.change(name, { target: { value: 'Creative Ballet Academy Ltd' } });
    expect(screen.getByLabelText(/Legal name of the business/)).toHaveValue('Creative Ballet Academy Ltd');
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(h.updates.length).toBeGreaterThan(0));
    expect(h.updates[0].legal_profile).toMatchObject({
      legal_name: 'Creative Ballet Academy Ltd',
      payment_providers: 'Grow, iCount',
      email: 'info@creativeballet.test',
    });
  });
});

describe('legal pack Confirm', () => {
  it('is possible with season details still open, and stores the details filled in for the studio', async () => {
    h.seasons = [];
    h.profile = { ...TYPED };
    wrap(<LegalPackPanel tenantId="t-1" mode="acknowledge" detailsHref="#legal-details" />);
    fireEvent.click(await screen.findByRole('checkbox'));
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.queryByText(/details missing/i)).toBeNull();
    fireEvent.click(confirm);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('acknowledge_studio_legal_pack', expect.anything()));
    expect(h.updates[0].legal_profile).toMatchObject({
      ...TYPED,
      legal_name: 'Creative Ballet',
      privacy_contact_email: 'info@creativeballet.test',
      privacy_contact_name: 'Dana Levi',
      payment_providers: 'Grow, iCount',
    });
  });

  it('still waits for a price the studio has to give', async () => {
    const rest = { ...TYPED };
    delete rest.season_price;
    h.profile = rest;
    wrap(<LegalPackPanel tenantId="t-1" mode="acknowledge" detailsHref="#legal-details" />);
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(await screen.findByText(/Price for the season/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});

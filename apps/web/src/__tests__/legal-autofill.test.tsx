// @vitest-environment jsdom
/**
 * Settings → Legal asks only for what we can't know: the studio's name,
 * contact email, owner, providers and business number fill the rest, kept
 * under "Details we filled in for you" (editable). The enrolment terms carry
 * no prices, counts or season dates (generic wording instead), so none is
 * asked. Confirm and Publish use one missing list.
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
  tenantRow: { payment_provider: 'grow', invoicing_provider: 'icount', offline_payment_instructions: '', invoice_license_number: '' } as Record<string, string>,
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
import { fieldsForVertical, missingLegalDetails } from '@/legal/fields';
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
  h.tenantRow = { payment_provider: 'grow', invoicing_provider: 'icount', offline_payment_instructions: '', invoice_license_number: '' };
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
    businessNumber: '514123456',
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
      business_number: '514123456',
      payment_methods: "card through the payment page (Grow); bank transfer or cash, as the studio's payment instructions say",
    });
    expect(legalAutofill(src, 'he').payment_methods).toBe(
      'כרטיס אשראי בעמוד התשלום (Grow); העברה בנקאית או מזומן, לפי הנחיות הסטודיו',
    );
  });

  it('there are no price, count or season fields any more', () => {
    for (const k of ['season_price', 'monthly_price', 'month_count', 'lesson_count', 'registration_fee', 'sibling_discount', 'season_name', 'season_start', 'season_end', 'payment_dates', 'holidays']) {
      expect(fieldsForVertical('dance-studio').map((f) => f.key)).not.toContain(k);
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

  it('a dance studio only types address and phone (insurance is optional)', () => {
    expect(missingLegalDetails('dance-studio', withLegalAutofill({}, legalAutofill({ tenantName: 'CB', contactEmail: 'a@b.c', ownerName: 'Dana', paymentProvider: 'grow' }, 'en'))).map((f) => f.key)).toEqual([
      'address',
      'phone',
    ]);
    expect(missingLegalDetails('dance-studio', filled)).toEqual([]);
  });

  it('the terms speak generically about fees, schedule and season, in both languages', async () => {
    for (const lang of ['en', 'he'] as const) {
      const raw = await loadLegalTemplate('enrolment-terms', lang);
      const out = prepareLegalMarkdown(raw, {
        doc: 'enrolment-terms',
        lang,
        vertical: 'dance-studio',
        tenantName: 'CB',
        contactEmail: 'a@b.c',
        profile: { ...filled, business_number: '514123456' },
        updatedAt: null,
      });
      const html = renderLegalHtml(out);
      expect(html).toContain(lang === 'en' ? 'Fees: as shown for the class at registration' : 'המחיר: כפי שמוצג לחוג בעת ההרשמה');
      expect(html).toContain(lang === 'en' ? 'as published by the studio for the current season' : 'כפי שמפרסם הסטודיו לעונה הנוכחית');
      expect(html).not.toContain('legal-missing');
    }
  });

  it('a detail still open shows as "to be completed" in the draft', async () => {
    const raw = await loadLegalTemplate('enrolment-terms', 'he');
    const rest = { ...filled };
    delete rest.insurance;
    const out = prepareLegalMarkdown(raw, {
      doc: 'enrolment-terms',
      lang: 'he',
      vertical: 'dance-studio',
      tenantName: 'CB',
      contactEmail: 'a@b.c',
      profile: rest,
      updatedAt: null,
    });
    expect(renderLegalHtml(out)).toMatch(/\[[^\]]+ – להשלמה\]/);
  });
});

describe('Settings → Legal', () => {
  it('shows only what the studio has to give; the rest is filled in, collapsed and editable', async () => {
    wrap(<LegalSettingsForm />);
    expect(await screen.findByLabelText(/Business address/)).toBeVisible();
    expect(screen.getByLabelText(/Business phone/)).toBeVisible();
    // Insurance is optional: the choice starts at "We don't have insurance", no policy field.
    expect(screen.getByLabelText(/^Insurance$/)).toHaveValue('none');
    expect(screen.queryByLabelText(/Insurance \(insurer and policy type\)/)).toBeNull();
    const summary = await screen.findByText(/Details we filled in for you \(\d+\)/);
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    const name = screen.getByLabelText(/Legal name of the business/);
    expect(details).toContainElement(name);
    await waitFor(() => expect(name).toHaveValue('Creative Ballet'));
    expect(screen.getByLabelText(/Privacy contact email/)).toHaveValue('info@creativeballet.test');
    expect(screen.getByLabelText(/Privacy contact \(name or role\)/)).toHaveValue('Dana Levi');
    expect(screen.getByLabelText(/Payment and invoicing providers/)).toHaveValue('Grow, iCount');
    expect(screen.queryByLabelText(/Price for the season/)).toBeNull();
    expect(screen.queryByLabelText(/Season name/)).toBeNull();

    fireEvent.change(name, { target: { value: 'Creative Ballet Academy Ltd' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(h.updates.length).toBeGreaterThan(0));
    expect(h.updates[0].legal_profile).toMatchObject({
      legal_name: 'Creative Ballet Academy Ltd',
      payment_providers: 'Grow, iCount',
      email: 'info@creativeballet.test',
    });
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    wrap(<LegalSettingsForm />);
    expect(await screen.findByText(/פרטים שמילאנו בשבילך/)).toBeInTheDocument();
  });
});

describe('legal pack Confirm', () => {
  it('needs only what the studio typed, and stores the details filled in for it', async () => {
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

  it('still waits for a detail only the studio can give', async () => {
    const rest = { ...TYPED };
    delete rest.phone;
    h.profile = rest;
    wrap(<LegalPackPanel tenantId="t-1" mode="acknowledge" detailsHref="#legal-details" />);
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(await screen.findByText(/Business phone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});

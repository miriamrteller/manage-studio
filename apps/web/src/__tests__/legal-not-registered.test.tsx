// @vitest-environment jsdom
/**
 * A studio that is not yet a registered business is run by a person: their
 * full name and Israeli ID (check digit), or a passport number and country,
 * stand in for a business number in the published documents. One of them is
 * required to Publish; Confirm is unchanged. Registered statuses unchanged.
 * Run: pnpm -C apps/web test legal-not-registered.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
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
    functions: { invoke: vi.fn() },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        maybeSingle: () => q,
        update: () => q,
        then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
      };
      return q;
    },
  },
}));

import i18n from '@/i18n/i18n';
import { isValidIsraeliId, personalIdentity } from '@shared/legal/personalIdentity';
import { fillSignedText, signedTemplateSource } from '@shared/legal/signed-template';
import { missingLegalDetails } from '@/legal/fields';
import { loadLegalTemplate } from '@/legal/templates';
import { prepareLegalMarkdown, type LegalLang } from '@/legal/render';
import { LegalSettingsForm } from '@/features/settings/components/LegalSettingsForm';

const BASE: Record<string, string> = {
  legal_name: 'Dana Levi',
  business_status: 'not_registered',
  address: '1 Herzl St, Tel Aviv',
  phone: '050-1234567',
  privacy_contact_name: 'Dana Levi',
  privacy_contact_email: 'info@creativeballet.test',
  payment_providers: 'Grow',
  payment_methods: 'card',
  insurance: 'third-party liability insurance',
};
const ID = '123456782';

async function rendered(doc: 'studio-privacy' | 'enrolment-terms', lang: LegalLang, profile: Record<string, string>) {
  return prepareLegalMarkdown(await loadLegalTemplate(doc, lang), {
    doc,
    lang,
    vertical: 'dance-studio',
    tenantName: 'Creative Ballet',
    contactEmail: 'info@creativeballet.test',
    profile,
    updatedAt: null,
  });
}

afterEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('Israeli ID check digit', () => {
  it('accepts valid numbers (with or without leading zeros) and refuses others', () => {
    expect(isValidIsraeliId('123456782')).toBe(true);
    expect(isValidIsraeliId('000000018')).toBe(true);
    expect(isValidIsraeliId('18')).toBe(false); // too short to be an ID
    expect(isValidIsraeliId('123456789')).toBe(false);
    expect(isValidIsraeliId('12345678a')).toBe(false);
    expect(isValidIsraeliId('000000000')).toBe(false);
    expect(isValidIsraeliId('')).toBe(false);
  });

  it('identity: an ID, or a passport with its country', () => {
    expect(personalIdentity({ personal_id: '123-456-782' })).toEqual({ kind: 'israeli_id', number: ID });
    expect(personalIdentity({ no_israeli_id: 'yes', passport_number: 'X1234567', passport_country: 'France' })).toEqual({
      kind: 'passport',
      number: 'X1234567',
      country: 'France',
    });
    expect(personalIdentity({ no_israeli_id: 'yes', passport_number: 'X1234567' })).toBeNull();
  });
});

describe('Publish for a studio that is not yet registered', () => {
  const keys = (p: Record<string, string>, stage: 'confirm' | 'publish' = 'publish') =>
    missingLegalDetails('dance-studio', p, stage, 'Creative Ballet').map((f) => f.key);

  it('needs a valid ID number (Confirm does not)', () => {
    expect(keys(BASE)).toEqual(['personal_id']);
    expect(keys({ ...BASE, personal_id: '123456789' })).toEqual(['personal_id']);
    expect(keys({ ...BASE, personal_id: ID })).toEqual([]);
    expect(keys(BASE, 'confirm')).toEqual([]);
  });

  it('or, without an Israeli ID, a passport number and country', () => {
    expect(keys({ ...BASE, no_israeli_id: 'yes' })).toEqual(['passport_number', 'passport_country']);
    expect(keys({ ...BASE, no_israeli_id: 'yes', passport_number: 'X1234567' })).toEqual(['passport_country']);
    expect(keys({ ...BASE, no_israeli_id: 'yes', passport_number: 'X1234567', passport_country: 'France' })).toEqual([]);
  });

  it("the person's full name, not just the studio's name", () => {
    expect(keys({ ...BASE, legal_name: 'Creative Ballet', personal_id: ID })).toEqual(['legal_name']);
  });

  it('registered statuses are unchanged', () => {
    for (const status of ['osek_patur', 'osek_murshe', 'company']) {
      expect(keys({ ...BASE, business_status: status })).toEqual([]);
    }
  });
});

describe('the documents', () => {
  it('enrolment terms: "<studio>, run by <name>, ID <number>" (en + he), nothing missing', async () => {
    const en = await rendered('enrolment-terms', 'en', { ...BASE, personal_id: ID });
    expect(en.markdown).toContain(`Creative Ballet, run by Dana Levi, ID ${ID}, 1 Herzl St`);
    expect(en.missing).toEqual([]);
    const he = await rendered('enrolment-terms', 'he', { ...BASE, legal_name: 'דנה לוי', personal_id: ID });
    expect(he.markdown).toContain(`Creative Ballet, בניהול דנה לוי, ת"ז ${ID}`);
  });

  it('privacy policy: the studio and the person, not yet a registered business, with the ID', async () => {
    const en = await rendered('studio-privacy', 'en', { ...BASE, personal_id: ID });
    expect(en.markdown).toContain(`**Creative Ballet, run by Dana Levi** (not yet a registered business; ID ${ID})`);
    const he = await rendered('studio-privacy', 'he', { ...BASE, legal_name: 'דנה לוי', personal_id: ID });
    expect(he.markdown).toContain(`(טרם נרשם/ה כעסק; ת"ז ${ID})`);
  });

  it('passport path', async () => {
    const en = await rendered('enrolment-terms', 'en', {
      ...BASE,
      no_israeli_id: 'yes',
      passport_number: 'X1234567',
      passport_country: 'France',
    });
    expect(en.markdown).toContain('Creative Ballet, run by Dana Levi, passport X1234567, France,');
  });

  it('without an ID the draft marks it to be completed (never prints an empty identity)', async () => {
    const en = await rendered('enrolment-terms', 'en', BASE);
    expect(en.missing).toContain('personal_id');
  });

  it('a registered studio still prints its business number', async () => {
    const en = await rendered('studio-privacy', 'en', { ...BASE, legal_name: 'CBA Ltd', business_status: 'company', business_number: '514123456' });
    expect(en.markdown).toContain('**CBA Ltd** (company no\\. 514123456)');
  });

  it('the signed service agreement too', () => {
    const text = fillSignedText(signedTemplateSource('service-agreement', 'en'), {
      lang: 'en',
      tenantName: 'Creative Ballet',
      contactEmail: 'info@creativeballet.test',
      profile: { ...BASE, personal_id: ID },
      vertical: 'photographer',
    });
    expect(text).toContain(`Provider: Dana Levi, individual, not yet a registered business; ID ${ID}`);
  });
});

describe('Settings → Legal', () => {
  function wrap(ui: ReactNode) {
    return render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>{ui}</MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );
  }
  function profileRow(profile: Record<string, string>) {
    h.rpc.mockImplementation(async (name: string) =>
      name === 'get_tenant_legal_profile'
        ? {
            data: [
              {
                tenant_id: 't-1',
                name: 'Creative Ballet',
                contact_email: 'info@creativeballet.test',
                skin: 'dance-studio',
                legal_profile: profile,
                legal_pages_published: false,
                legal_profile_updated_at: null,
                legal_pack_required: true,
                legal_pack_acknowledged_at: null,
                language_default: 'en',
              },
            ],
            error: null,
          }
        : { data: [], error: null },
    );
  }

  it('not yet registered: full name, ID (validated), or passport and country', async () => {
    profileRow({ business_status: 'not_registered' });
    wrap(<LegalSettingsForm />);
    expect(await screen.findByLabelText(/Your full name/)).toBeInTheDocument();
    const id = screen.getByLabelText(/Your ID number/);
    expect(screen.queryByLabelText(/^Business number/)).toBeNull();
    fireEvent.change(id, { target: { value: '123456789' } });
    expect(await screen.findByText("This isn't a valid Israeli ID number. Check the 9 digits.")).toBeInTheDocument();
    expect(id).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(id, { target: { value: ID } });
    await waitFor(() => expect(id).not.toHaveAttribute('aria-invalid'));
    fireEvent.click(screen.getByLabelText("I don't have an Israeli ID number"));
    expect(screen.queryByLabelText(/Your ID number/)).toBeNull();
    expect(screen.getByLabelText(/Passport number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Country that issued the passport/)).toBeInTheDocument();
  });

  it('a registered studio sees the business number, not the personal fields', async () => {
    profileRow({ business_status: 'osek_patur' });
    wrap(<LegalSettingsForm />);
    expect(await screen.findByLabelText(/^Business number/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Your ID number/)).toBeNull();
    expect(screen.getByLabelText(/Legal name of the business/)).toBeInTheDocument();
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    profileRow({ business_status: 'not_registered' });
    wrap(<LegalSettingsForm />);
    expect(await screen.findByLabelText(/מספר תעודת הזהות שלך/)).toBeInTheDocument();
    expect(screen.getByLabelText(/שמך המלא/)).toBeInTheDocument();
  });
});

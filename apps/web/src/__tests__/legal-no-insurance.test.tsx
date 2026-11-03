// @vitest-environment jsdom
/**
 * "We don't have insurance" never blocks the flow (owner decision): Confirm
 * and Publish work, the owner sees an informational notice, the enrolment
 * terms say the studio isn't insured, and the health declaration includes the
 * signer's acknowledgement as part of the text they sign. Photographers (no
 * insurance part) are unchanged.
 * Run: pnpm -C apps/web test legal-no-insurance.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

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
import { fieldsForVertical, missingLegalDetails } from '@/legal/fields';
import { loadLegalTemplate } from '@/legal/templates';
import { NO_INSURANCE_TERMS, prepareLegalMarkdown, type LegalLang } from '@/legal/render';
import { NO_INSURANCE_DECLARATION, studioSignedForms } from '@shared/legal/signed-template';
import { LegalSettingsForm } from '@/features/settings/components/LegalSettingsForm';

const BASE: Record<string, string> = {
  legal_name: 'Creative Ballet Ltd',
  business_status: 'company',
  business_number: '514123456',
  address: '1 Herzl St',
  phone: '050-1234567',
  privacy_contact_name: 'Dana',
  privacy_contact_email: 'a@b.c',
  payment_providers: 'Grow',
  payment_methods: 'card',
};
const NONE = { ...BASE, insurance_status: 'none' };

async function terms(lang: LegalLang, profile: Record<string, string>) {
  return prepareLegalMarkdown(await loadLegalTemplate('enrolment-terms', lang), {
    doc: 'enrolment-terms',
    lang,
    vertical: 'dance-studio',
    tenantName: 'Creative Ballet',
    contactEmail: 'a@b.c',
    profile,
    updatedAt: null,
  });
}
const ctx = (lang: LegalLang, profile: Record<string, string>) => ({
  lang,
  tenantName: 'Creative Ballet',
  contactEmail: 'a@b.c',
  profile,
});

afterEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('Confirm and Publish', () => {
  it('"We don\'t have insurance" never blocks', () => {
    expect(missingLegalDetails('dance-studio', NONE, 'confirm')).toEqual([]);
    expect(missingLegalDetails('dance-studio', NONE, 'publish')).toEqual([]);
  });

  it('otherwise the insurer and policy are still asked for', () => {
    expect(missingLegalDetails('dance-studio', BASE).map((f) => f.key)).toEqual(['insurance']);
    expect(missingLegalDetails('dance-studio', { ...BASE, insurance_status: 'insured' }).map((f) => f.key)).toEqual(['insurance']);
  });
});

describe('the enrolment terms', () => {
  it('say the studio is not insured (en + he), with nothing left to complete', async () => {
    const en = await terms('en', NONE);
    expect(en.markdown).toContain(NO_INSURANCE_TERMS.en);
    expect(en.markdown).not.toContain('third-party liability');
    expect(en.missing).toEqual([]);
    const he = await terms('he', NONE);
    expect(he.markdown).toContain('לסטודיו אין כרגע ביטוח המכסה משתתפים');
  });

  it('name the policy when insured (unchanged)', async () => {
    const en = await terms('en', { ...BASE, insurance_status: 'insured', insurance: 'third-party liability, Harel' });
    expect(en.markdown).toContain('The studio holds third\\-party liability, Harel');
  });
});

describe('the health declaration parents sign', () => {
  it('includes the acknowledgement in its Declaration (en + he), as part of the signed text', () => {
    for (const lang of ['en', 'he'] as const) {
      const forms = studioSignedForms('dance-studio', ctx(lang, NONE));
      expect(forms.length).toBeGreaterThan(0);
      for (const form of forms) expect(form.content).toContain(NO_INSURANCE_DECLARATION[lang]);
    }
  });

  it('says nothing about insurance when insured', () => {
    for (const form of studioSignedForms('dance-studio', ctx('en', { ...BASE, insurance_status: 'insured' }))) {
      expect(form.content).not.toContain(NO_INSURANCE_DECLARATION.en);
    }
  });
});

describe('photographers', () => {
  it('have no insurance part at all', () => {
    expect(fieldsForVertical('photographer').map((f) => f.key)).not.toContain('insurance_status');
    expect(fieldsForVertical('photographer').map((f) => f.key)).not.toContain('insurance');
    for (const form of studioSignedForms('photographer', { ...ctx('en', NONE), vertical: 'photographer' })) {
      expect(form.content).not.toContain(NO_INSURANCE_DECLARATION.en);
    }
  });
});

describe('Settings → Legal', () => {
  function setup(profile: Record<string, string>) {
    h.rpc.mockImplementation(async (name: string) =>
      name === 'get_tenant_legal_profile'
        ? {
            data: [
              {
                tenant_id: 't-1',
                name: 'Creative Ballet',
                contact_email: 'a@b.c',
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
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <LegalSettingsForm />
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );
  }

  it('choosing "We don\'t have insurance" hides the policy field and shows the (informational) notice', async () => {
    setup({});
    const choice = await screen.findByLabelText(/^Insurance$/);
    expect(screen.getByLabelText(/Insurance \(insurer and policy type\)/)).toBeInTheDocument();
    fireEvent.change(choice, { target: { value: 'none' } });
    expect(screen.queryByLabelText(/Insurance \(insurer and policy type\)/)).toBeNull();
    expect(screen.getByText(/Most studios working with children need liability and personal-accident insurance/)).toHaveAttribute('role', 'note');
  });

  it('in Hebrew', async () => {
    await i18n.changeLanguage('he');
    setup({ insurance_status: 'none' });
    expect(await screen.findByText(/רוב הסטודיואים שעובדים עם ילדים צריכים ביטוח/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * Skins as data: a skin row carries names, default switches and main-noun words.
 * Built-in skins (Creative Ballet's dance-studio included) never change wording.
 * The wizard lists live skins only, and a marketing link preselects the field.
 * Run: pnpm -C apps/web test skins-as-data.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  rows: [] as Record<string, unknown>[],
  tenants: [] as { skin: string }[],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase', () => {
  function query(table: string) {
    const filters: [string, unknown][] = [];
    const run = () => {
      if (table === 'tenants') return { data: h.tenants, error: null };
      const data = h.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      return { data, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      insert: async (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { error: null };
      },
      update: (row: Record<string, unknown>) => {
        h.updated.push(row);
        return { eq: async () => ({ error: null }) };
      },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return q;
  }
  return { supabase: { rpc: h.rpc, functions: { invoke: h.invoke }, from: query } };
});

import i18n from '@/i18n/i18n';
import {
  parseSkinRow,
  resolveStudioLabels,
  skinLabelsFor,
  toSkinRow,
  skinForMarketingPage,
  EXISTING_STUDIO_PROFILE,
  type StudioProfile,
} from '@shared/index';
import { OperatorOnboardingWizard } from '@/features/platform/components/OperatorOnboardingWizard';
import { profileDefaultsFor } from '@/features/platform/lib/studioSetupForm';
import { fieldFromSearch, rememberSignupField, signupFieldSearch, skinColours } from '@/features/skins/wizardFields';
import { formQuestions, parseLeadFormConfig, presetKeysFor } from '@shared/index';
import { signedFormsForSkin, studioSignedForms } from '@shared/legal/signed-template';
import { INITIAL_FORM } from '@/features/platform/lib/studioSetupForm';
import SkinsPage from '@/features/skins/SkinsPage';

const BUILT_IN_ROWS = [
  { id: 'dance-studio', name_en: 'Dance studio', name_he: 'סטודיו לריקוד', hint_en: 'Classes, terms and family billing', hint_he: '', status: 'live', is_active: true, sort_order: 10, marketing_pages: ['dance-teacher'], default_switches: { payment_flow: 'recurring', teaches_classes: true, family_accounts: true, client_booking: false }, label_overrides: { en: { contact: { singular: 'Hacked', plural: 'Hacked' } } }, legal_addon: null, enquiry_presets: [], colours: {} },
  { id: 'photographer', name_en: 'Photographer', name_he: 'צלם/ת', hint_en: 'Shoots, galleries and contracts', hint_he: '', status: 'live', is_active: true, sort_order: 20, marketing_pages: ['photographer'], default_switches: { payment_flow: 'project', teaches_classes: false, family_accounts: false, client_booking: true }, label_overrides: {}, legal_addon: 'photographer', enquiry_presets: [], colours: {} },
  { id: 'generic', name_en: 'Other', name_he: 'אחר', hint_en: 'General bookings and payments', hint_he: '', status: 'live', is_active: true, sort_order: 1000, marketing_pages: [], default_switches: { payment_flow: 'both' }, label_overrides: {}, legal_addon: null, enquiry_presets: [], colours: {} },
];
const SWIM = {
  id: 'swim-coach', name_en: 'Swim coach', name_he: 'מאמן/ת שחייה', hint_en: 'Lessons by the pool', hint_he: 'שיעורים בבריכה', status: 'live', is_active: true, sort_order: 40,
  marketing_pages: ['swim-coach'],
  default_switches: { payment_flow: 'recurring', teaches_classes: false, family_accounts: true, client_booking: true },
  label_overrides: { en: { contact: { singular: 'Swimmer', plural: 'Swimmers' } }, he: { contact: { singular: 'שחיין', plural: 'שחיינים' } } },
  legal_addon: 'coaching', enquiry_presets: ['preferred_date'], colours: {},
};
const DRAFT = { ...SWIM, id: 'yoga', name_en: 'Yoga teacher', name_he: 'מורה ליוגה', status: 'draft', marketing_pages: ['yoga'] };

function wrap(ui: ReactNode, path = '/') {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

async function toTypeStep() {
  fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Pool Kids' } });
  fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'poolkids' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('What kind of business is it?');
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  h.rpc.mockResolvedValue({ data: true, error: null });
  h.rows = [...BUILT_IN_ROWS, SWIM, DRAFT];
  h.tenants = [{ skin: 'dance-studio' }, { skin: 'dance-studio' }, { skin: 'swim-coach' }];
  h.inserted = [];
  h.updated = [];
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(async () => {
  vi.unstubAllEnvs();
  h.rpc.mockReset();
  window.history.replaceState({}, '', '/');
  await i18n.changeLanguage('en');
});

describe('skin rows', () => {
  it('parse and write back the same data', () => {
    const skin = parseSkinRow(SWIM);
    expect(skin.switches).toEqual({ paymentFlow: 'recurring', teachesClasses: false, familyAccounts: true, clientBooking: true });
    expect(skin.labels.en?.contact).toEqual({ singular: 'Swimmer', plural: 'Swimmers' });
    expect(skin.legalAddon).toBe('coaching');
    const row = toSkinRow(skin);
    expect(row.default_switches).toEqual(SWIM.default_switches);
    expect(row.label_overrides).toEqual(SWIM.label_overrides);
  });

  it('drops unknown nouns, bad add-ons and unknown questions', () => {
    const skin = parseSkinRow({ ...SWIM, label_overrides: { en: { wizard: { singular: 'x', plural: 'y' } } }, legal_addon: 'lawyer', enquiry_presets: ['nope', 'preferred_date'] });
    expect(skin.labels).toEqual({});
    expect(skin.legalAddon).toBeNull();
    expect(skin.enquiryPresets).toEqual(['preferred_date']);
  });

  it('a data skin renames the main nouns; the studio\'s own words still win', () => {
    const swim = parseSkinRow(SWIM);
    const profile: StudioProfile = { paymentFlow: 'recurring', teachesClasses: false, familyAccounts: true, clientBooking: true };
    expect(resolveStudioLabels(profile, {}, 'en', 'generic', skinLabelsFor(swim, 'en')).contact.singular).toBe('Swimmer');
    expect(resolveStudioLabels(profile, {}, 'he', 'generic', skinLabelsFor(swim, 'he')).contact.plural).toBe('שחיינים');
    const own = { contact: { singular: 'Pupil', plural: 'Pupils' } };
    expect(resolveStudioLabels(profile, own, 'en', 'generic', skinLabelsFor(swim, 'en')).contact.singular).toBe('Pupil');
  });

  it('Creative Ballet (dance-studio) keeps its words even if its row has words', () => {
    const dance = parseSkinRow(BUILT_IN_ROWS[0]);
    expect(skinLabelsFor(dance, 'en')).toEqual({});
    for (const locale of ['en', 'he'] as const) {
      expect(resolveStudioLabels(EXISTING_STUDIO_PROFILE, {}, locale, 'dance-studio', skinLabelsFor(dance, locale))).toEqual(
        resolveStudioLabels(EXISTING_STUDIO_PROFILE, {}, locale, 'dance-studio'),
      );
    }
  });

  it('a marketing page finds its live skin; drafts never match', () => {
    const skins = [SWIM, DRAFT].map(parseSkinRow);
    expect(skinForMarketingPage(skins, 'swim-coach')?.id).toBe('swim-coach');
    expect(skinForMarketingPage(skins, 'yoga')).toBeNull();
    expect(fieldFromSearch('?from=swim-coach', skins.filter((s) => s.status === 'live'))).toBe('swim-coach');
    expect(fieldFromSearch('?field=swim-coach', skins.filter((s) => s.status === 'live'))).toBe('swim-coach');
    expect(fieldFromSearch('?field=yoga', skins.filter((s) => s.status === 'live'))).toBeNull();
  });

  it('a field from a sign-up link survives the email link (used once)', () => {
    rememberSignupField('?from=swim-coach');
    expect(signupFieldSearch('')).toBe('?from=swim-coach');
    expect(signupFieldSearch('')).toBe('');
  });

  it('the wizard prefill follows the skin\'s switches; built-in values fill gaps', () => {
    expect(profileDefaultsFor('swim-coach', parseSkinRow(SWIM))).toEqual({
      paymentFlow: 'recurring', teachesClasses: false, familyAccounts: true, clientBooking: true,
    });
    expect(profileDefaultsFor('dance-studio')).toEqual(profileDefaultsFor('dance-studio', parseSkinRow(BUILT_IN_ROWS[0])));
  });
});

describe('wizard "Your field"', () => {
  it('lists the live skins and hides drafts', async () => {
    wrap(<OperatorOnboardingWizard />);
    await toTypeStep();
    expect(await screen.findByRole('radio', { name: /Swim coach/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Dance studio/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Yoga teacher/ })).not.toBeInTheDocument();
  });

  it('choosing a data skin prefills its switches', async () => {
    wrap(<OperatorOnboardingWizard />);
    await toTypeStep();
    fireEvent.click(await screen.findByRole('radio', { name: /Swim coach/ }));
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Parents pay for children/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /I teach classes/ })).not.toBeChecked();
  });

  it('a marketing industry link preselects the field', async () => {
    wrap(<OperatorOnboardingWizard />, '/platform/onboard?from=swim-coach');
    await toTypeStep();
    const swim = await screen.findByRole('radio', { name: /Swim coach/ }, { timeout: 5000 });
    await waitFor(() => expect(swim).toBeChecked(), { timeout: 5000 });
  });
}, 20000);

describe('/platform/skins', () => {
  it('lists every skin with its status and studio count', async () => {
    wrap(<SkinsPage />);
    const table = await screen.findByRole('table', { name: 'Skins' });
    const row = within(table).getByRole('row', { name: /Dance studio/ });
    expect(within(row).getByText('Live')).toBeInTheDocument();
    await waitFor(() => expect(within(row).getByText('2')).toBeInTheDocument());
    expect(within(within(table).getByRole('row', { name: /Yoga teacher/ })).getByText('Draft')).toBeInTheDocument();
  });

  it('editing a live skin warns how many studios it changes, and still saves', async () => {
    wrap(<SkinsPage />);
    await screen.findByRole('table', { name: 'Skins' });
    await waitFor(() => expect(screen.getAllByText('1').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Swim coach' }));
    expect(screen.getByText(/this changes 1 studio that uses it/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Person (client): English, one' }), { target: { value: 'Learner' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Person (client): English, many' }), { target: { value: 'Learners' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save skin' }));
    await screen.findByText('Swim coach is saved.');
    expect(h.updated[0]).toMatchObject({ label_overrides: { en: { contact: { singular: 'Learner', plural: 'Learners' } } } });
  });

  it('a built-in skin\'s words are not editable', async () => {
    wrap(<SkinsPage />);
    await screen.findByRole('table', { name: 'Skins' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dance studio' }));
    expect(screen.getByText(/Built-in skins keep the words built into the app/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Person (client): English, one' })).not.toBeInTheDocument();
  });

  it('a new skin needs an id and both names; it is saved as a draft by default', async () => {
    wrap(<SkinsPage />);
    await screen.findByRole('table', { name: 'Skins' });
    fireEvent.click(screen.getByRole('button', { name: 'New skin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save skin' }));
    expect(await screen.findByText('Some answers need a look before saving.')).toBeInTheDocument();
    expect(h.inserted).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Skin id'), { target: { value: 'art-class' } });
    fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Art class' } });
    fireEvent.change(screen.getByLabelText('Name (Hebrew)'), { target: { value: 'חוג אמנות' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save skin' }));
    await screen.findByText('Art class is saved.');
    expect(h.inserted[0]).toMatchObject({ id: 'art-class', name_en: 'Art class', status: 'draft' });
  });

  it('shows in Hebrew', async () => {
    await i18n.changeLanguage('he');
    wrap(<SkinsPage />);
    expect(await screen.findByRole('heading', { name: 'סקינים' })).toBeInTheDocument();
    expect(await screen.findByText('מאמן/ת שחייה')).toBeInTheDocument();
  });
});

describe('skins part B: enquiry questions, colours, legal add-on', () => {
  it('a chosen question outside the field\'s usual set still shows on the form', () => {
    const config = parseLeadFormConfig({
      presets: { preferred_date: { enabled: true }, experience: { enabled: true } },
      extra: ['experience', 'preferred_date', 'nope'],
    });
    expect(config.extra).toEqual(['experience', 'preferred_date']);
    expect(presetKeysFor(config, 'general')).toEqual(['service_interest', 'preferred_date', 'experience']);
    expect(formQuestions(config, 'general').map((q) => q.key)).toEqual(['preferred_date', 'experience']);
    // Switched on for another kind but not given by the skin: stays hidden (as before).
    const stale = parseLeadFormConfig({ presets: { child_name: { enabled: true } } });
    expect(formQuestions(stale, 'photography')).toEqual([]);
  });

  it('a data skin signs the agreement with its add-on; built-in skins keep their own forms', () => {
    expect(signedFormsForSkin('swim-coach', 'photographer')[0]).toMatchObject({ doc: 'service-agreement', addon: 'addon-photographer' });
    expect(signedFormsForSkin('swim-coach', 'coaching')[0].addon).toBeUndefined();
    expect(signedFormsForSkin('swim-coach', null)[0].addon).toBeUndefined();
    expect(signedFormsForSkin('dance-studio', 'beautician')).toEqual(signedFormsForSkin('dance-studio'));
    expect(signedFormsForSkin('photographer', 'beautician')[0].addon).toBe('addon-photographer');
    const ctx = { lang: 'en' as const, tenantName: 'Pool Kids', contactEmail: 'a@b.c', profile: {} };
    expect(studioSignedForms('dance-studio', ctx, 'beautician')).toEqual(studioSignedForms('dance-studio', ctx));
    expect(studioSignedForms('swim-coach', ctx, 'beautician')[0].content.length).toBeGreaterThan(studioSignedForms('swim-coach', ctx)[0].content.length);
  });

  it('choosing a field brings its colours unless the owner picked their own', () => {
    const swim = parseSkinRow({ ...SWIM, colours: { primary: '#0369A1', accent: '#14B8A6' } });
    const plain = parseSkinRow(SWIM);
    const start = { vertical: 'generic', primaryColor: INITIAL_FORM.primaryColor, accentColor: INITIAL_FORM.accentColor };
    expect(skinColours(start, [swim], swim)).toEqual({ primaryColor: '#0369A1', accentColor: '#14B8A6' });
    expect(skinColours({ ...start, primaryColor: '#111111' }, [swim], swim)).toEqual({});
    expect(skinColours(start, [swim], plain)).toEqual({});
    // Switching away from a skin's colours to a skin without them goes back to the defaults only via a skin that has colours.
    expect(skinColours({ vertical: 'swim-coach', primaryColor: '#0369A1', accentColor: '#14B8A6' }, [swim], swim)).toEqual({ primaryColor: '#0369A1', accentColor: '#14B8A6' });
  });

  it('the Skins page saves enquiry questions and colours, and previews a sample studio', async () => {
    wrap(<SkinsPage />);
    await screen.findByRole('table', { name: 'Skins' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Swim coach' }));
    const preview = screen.getByRole('region', { name: 'Sample studio' });
    expect(within(preview).getByText('Swimmers')).toBeInTheDocument();
    expect(within(preview).getByText('Add Swimmer')).toBeInTheDocument();
    expect(within(preview).getByText('Preferred date', { selector: 'li' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Previous experience' }));
    fireEvent.change(screen.getByLabelText('Main colour'), { target: { value: '#0369A1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save skin' }));
    await screen.findByText('Swim coach is saved.');
    expect(h.updated[0]).toMatchObject({ enquiry_presets: ['experience', 'preferred_date'], colours: { primary: '#0369A1' } });
  });

  it('a bad colour code is caught before saving', async () => {
    wrap(<SkinsPage />);
    await screen.findByRole('table', { name: 'Skins' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Swim coach' }));
    fireEvent.change(screen.getByLabelText('Accent colour'), { target: { value: 'blue' } });
    expect(screen.getByText('Use a colour code like #5B6CFF.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save skin' }));
    expect(await screen.findByText('Some answers need a look before saving.')).toBeInTheDocument();
    expect(h.updated).toHaveLength(0);
  });

  it('says when an add-on is not in the signed forms yet', async () => {
    wrap(<SkinsPage />);
    await screen.findByRole('table', { name: 'Skins' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Swim coach' }));
    expect(screen.getByText(/This add-on is not in the signed forms yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Service-agreement add-on'), { target: { value: 'photographer' } });
    expect(screen.queryByText(/This add-on is not in the signed forms yet/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Sample studio' })).getByText(/with the Photographer add-on/)).toBeInTheDocument();
  });
});

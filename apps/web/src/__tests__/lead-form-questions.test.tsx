// @vitest-environment jsdom
/**
 * Enquiry-form questions (step 2b): the shared rules (packages/shared/src/leadForm.ts)
 * that both the form and crm-lead-capture run, the public form, the Settings
 * editor, and the leads-page answer filter.
 * Run: pnpm -C apps/web test lead-form-questions
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  MAX_CUSTOM_QUESTIONS,
  answerText,
  formQuestions,
  leadFormConfigErrors,
  leadFormKindFor,
  parseLeadFormConfig,
  validateLeadAnswers,
  type LeadFormConfig,
} from '@shared/index';

const h = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> => ({ data: { outcome: 'created' }, error: null })),
  rpc: vi.fn(async (name: string): Promise<{ data: unknown; error: unknown }> => {
    if (name === 'get_lead_form') return { data: h.form, error: null };
    if (name === 'get_public_offerings_by_subdomain') return { data: h.classes, error: null };
    return { data: null, error: { message: 'unknown' } };
  }),
  update: vi.fn(),
  form: {} as unknown,
  classes: [] as Array<{ id: string; name: string }>,
  tenant: { id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet', vertical: 'dance-studio', business_preset: 'programs' },
}));
// Signed out: the public form starts blank (signed-in prefill: prefill-enrolment.test.tsx).
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: h.invoke },
    rpc: h.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { lead_form: h.form }, error: null }) }) }),
      update: (values: unknown) => {
        h.update(values);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${o.count}` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => h.tenant }));
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 'creativeballet' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn(async () => undefined) } }));

import { InquiryForm } from '@/features/crm/components/InquiryForm';
import { LeadFormSettings, parseOptionLines } from '@/features/settings/components/LeadFormSettings';
import { answerFilterOptions, filterByAnswer } from '@/features/crm/lib/leadAnswers';
import type { StoredAnswer } from '@shared/index';

function wrap(ui: ReactNode, url = '/inquire') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  h.form = {};
  h.classes = [];
});

const classesConfig: LeadFormConfig = {
  presets: {
    child_name: { enabled: true, required: true },
    child_birth_date: { enabled: true, required: false },
    class_interest: { enabled: true, required: false },
    preferred_days: { enabled: true, required: false },
  },
  custom: [{ id: 'abc', type: 'select', label: { en: 'How did you hear?', he: 'איך שמעתם?' }, required: false, options: [{ en: 'Friend', he: 'חבר' }, { en: 'Flyer', he: 'עלון' }] }],
};

describe('which ready-made set a studio gets', () => {
  it.each([
    ['photographer', 'services', 'photography'],
    ['dance-studio', 'programs', 'classes'],
    ['generic', 'programs', 'classes'],
    ['generic', 'services', 'general'],
    ['beautician', 'services', 'general'],
    [null, null, 'general'],
  ])('%s / %s → %s', (vertical, preset, kind) => {
    expect(leadFormKindFor(vertical, preset)).toBe(kind);
  });
});

describe('parseLeadFormConfig', () => {
  it('drops unknown presets, bad types, duplicate ids and anything past 5 custom questions', () => {
    const custom = Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, type: 'short_text', label: { en: `Q${i}` }, required: false }));
    const parsed = parseLeadFormConfig({
      presets: { child_name: { enabled: true, required: true }, nope: { enabled: true }, experience: { enabled: false, required: true } },
      custom: [{ id: 'q0', type: 'short_text', label: { en: 'dup first' } }, ...custom, { id: 'bad', type: 'date', label: { en: 'x' } }],
    });
    expect(Object.keys(parsed.presets).sort()).toEqual(['child_name', 'experience']);
    expect(parsed.presets.experience).toEqual({ enabled: false, required: false });
    expect(parsed.custom).toHaveLength(MAX_CUSTOM_QUESTIONS);
    expect(parsed.custom[0].label).toEqual({ en: 'dup first', he: 'dup first' });
    expect(new Set(parsed.custom.map((q) => q.id)).size).toBe(MAX_CUSTOM_QUESTIONS);
  });

  it('a choice question without choices is dropped; garbage reads as an empty form', () => {
    expect(parseLeadFormConfig({ custom: [{ id: 'a', type: 'select', label: { en: 'Pick' }, options: [] }] }).custom).toEqual([]);
    expect(parseLeadFormConfig('nonsense')).toEqual({ presets: {}, custom: [] });
    expect(parseLeadFormConfig(null)).toEqual({ presets: {}, custom: [] });
  });

  it('saving needs a label and, for choices, at least one choice', () => {
    expect(leadFormConfigErrors({ presets: {}, custom: [{ id: 'a', type: 'select', label: { en: 'x', he: 'x' }, required: false, options: [] }] })).toEqual(['custom_0_options']);
    expect(leadFormConfigErrors(classesConfig)).toEqual([]);
  });
});

describe('formQuestions + validateLeadAnswers', () => {
  const classes = [{ id: 'off-1', name: 'Ballet 1' }, { id: 'off-2', name: 'Jazz' }];

  it('only this kind of studio\'s ready-made questions, then custom ones', () => {
    const qs = formQuestions(classesConfig, 'classes', classes);
    expect(qs.map((q) => q.key)).toEqual(['child_name', 'child_birth_date', 'class_interest', 'preferred_days', 'c_abc']);
    // The same config on a photographer shows none of the class questions.
    expect(formQuestions(classesConfig, 'photography', classes).map((q) => q.key)).toEqual(['c_abc']);
  });

  it('the class question is left out when the studio has no public classes', () => {
    expect(formQuestions(classesConfig, 'classes', []).map((q) => q.key)).not.toContain('class_interest');
  });

  it('maps answers to lead columns and keeps the rest with their labels', () => {
    const qs = formQuestions(classesConfig, 'classes', classes);
    const r = validateLeadAnswers(qs, {
      child_name: ' Noa ',
      child_birth_date: '2019-04-02',
      class_interest: 'off-2',
      preferred_days: ['mon', 'wed'],
      c_abc: '1',
      not_a_question: 'ignored',
    });
    expect(r.ok).toBe(true);
    expect(r.columns).toEqual({ child_name: 'Noa', child_birth_date: '2019-04-02', offering_id: 'off-2' });
    expect(Object.keys(r.answers).sort()).toEqual(['c_abc', 'class_interest', 'preferred_days']);
    expect(answerText(r.answers.preferred_days, 'he')).toBe('שני, רביעי');
    expect(answerText(r.answers.c_abc, 'en')).toBe('Flyer');
    expect(answerText(r.answers.class_interest, 'en')).toBe('Jazz');
  });

  it('refuses missing required answers and invalid values', () => {
    const qs = formQuestions(classesConfig, 'classes', classes);
    const r = validateLeadAnswers(qs, {
      child_birth_date: '2019-02-30',
      class_interest: 'someone-elses-class',
      preferred_days: ['mon', 'mon-ish'],
      c_abc: '7',
    });
    expect(r.ok).toBe(false);
    expect(r.invalid.sort()).toEqual(['c_abc', 'child_birth_date', 'child_name', 'class_interest', 'preferred_days']);
  });

  it('number answers respect the ready-made bounds', () => {
    const qs = formQuestions({ presets: { child_age: { enabled: true, required: true } }, custom: [] }, 'classes');
    expect(validateLeadAnswers(qs, { child_age: 7 }).answers.child_age.value).toBe(7);
    expect(validateLeadAnswers(qs, { child_age: '200' }).ok).toBe(false);
    expect(validateLeadAnswers(qs, { child_age: 'seven' }).ok).toBe(false);
  });
});

describe('public form with questions', () => {
  it('shows the studio\'s questions and sends the answers', async () => {
    h.form = classesConfig;
    h.classes = [{ id: 'off-1', name: 'Ballet 1' }];
    wrap(<InquiryForm />);
    const child = await screen.findByLabelText(/Child's name/);
    fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
    fireEvent.change(child, { target: { value: 'Noa' } });
    fireEvent.change(screen.getByLabelText(/Class or level of interest/), { target: { value: 'off-1' } });
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    const body = (h.invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(body.answers).toEqual({ child_name: 'Noa', class_interest: 'off-1', preferred_days: ['mon'] });
    expect(body.marketingConsent).toBeNull();
  });

  it('a required question left empty stops the send and is marked', async () => {
    h.form = classesConfig;
    wrap(<InquiryForm />);
    const child = await screen.findByLabelText(/Child's name/);
    fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
    fireEvent.submit(child.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'pages.crm.inquire.answers_error');
    expect(child.getAttribute('aria-invalid')).toBe('true');
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('fields the server refuses are marked too', async () => {
    h.form = { presets: { experience: { enabled: true, required: false } }, custom: [] };
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'invalid_answers', fields: ['experience'] }) } },
    });
    wrap(<InquiryForm />);
    const select = await screen.findByLabelText(/Previous experience/);
    fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
    fireEvent.change(select, { target: { value: 'some' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await waitFor(() => expect(select.getAttribute('aria-invalid')).toBe('true'));
  });

  it('with no questions saved, the form is unchanged and sends no answers', async () => {
    wrap(<InquiryForm />);
    fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    const body = (h.invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(body.answers).toBeNull();
    expect(screen.queryByLabelText(/Child's name/)).toBeNull();
  });
});

describe('Settings editor', () => {
  it('turns on a ready-made question, adds a custom one and saves both', async () => {
    wrap(<LeadFormSettings />);
    fireEvent.click(await screen.findByLabelText("Child's name"));
    fireEvent.click(screen.getByRole('button', { name: 'settings.lead_form.add' }));
    fireEvent.change(screen.getByLabelText('settings.lead_form.label_en'), { target: { value: 'Any allergies?' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const saved = (h.update.mock.calls[0][0] as { lead_form: LeadFormConfig }).lead_form;
    expect(saved.presets.child_name).toEqual({ enabled: true, required: false });
    expect(saved.custom).toHaveLength(1);
    expect(saved.custom[0]).toMatchObject({ type: 'short_text', label: { en: 'Any allergies?' } });
  });

  it('stops at 5 custom questions and shows the short-form hint', async () => {
    wrap(<LeadFormSettings />);
    const add = await screen.findByRole('button', { name: 'settings.lead_form.add' });
    for (let i = 0; i < 7; i++) fireEvent.click(add);
    expect(screen.getAllByLabelText('settings.lead_form.label_en')).toHaveLength(MAX_CUSTOM_QUESTIONS);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/settings.lead_form.short_hint:5/)).toBeTruthy();
  });

  it('refuses to save a question without a label', async () => {
    wrap(<LeadFormSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'settings.lead_form.add' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'settings.lead_form.errors');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('reads choices typed as "English | Hebrew", one per line', () => {
    expect(parseOptionLines('Beginner | מתחילים\nAdvanced\n\n | רק עברית')).toEqual([
      { en: 'Beginner', he: 'מתחילים' },
      { en: 'Advanced', he: 'Advanced' },
      { en: 'רק עברית', he: 'רק עברית' },
    ]);
  });
});

describe('leads page answer filter', () => {
  const label = { en: 'Previous experience', he: 'ניסיון קודם' };
  const days = { en: 'Preferred days', he: 'ימים מועדפים' };
  const leads: { id: string; answers: Record<string, StoredAnswer> | null }[] = [
    { id: '1', answers: { experience: { label, value: 'none', display: [{ en: 'None yet', he: 'אין עדיין' }] } } },
    { id: '2', answers: { experience: { label, value: 'more', display: [{ en: 'More than a year', he: 'יותר משנה' }] }, preferred_days: { label: days, value: ['mon', 'wed'], display: [{ en: 'Monday', he: 'שני' }, { en: 'Wednesday', he: 'רביעי' }] } } },
    { id: '3', answers: null },
  ];

  it('lists questions and the answers given', () => {
    expect(answerFilterOptions(leads, 'en')).toEqual([
      { key: 'preferred_days', label: 'Preferred days', values: ['Monday', 'Wednesday'] },
      { key: 'experience', label: 'Previous experience', values: ['More than a year', 'None yet'] },
    ]);
  });

  it('filters by an answer, matching any picked option', () => {
    expect(filterByAnswer(leads, 'experience', 'None yet', 'en').map((l) => l.id)).toEqual(['1']);
    expect(filterByAnswer(leads, 'preferred_days', 'רביעי', 'he').map((l) => l.id)).toEqual(['2']);
    expect(filterByAnswer(leads, '', '', 'en')).toHaveLength(3);
  });
});

// @vitest-environment jsdom
/**
 * Named forms (2d): shared rules (slugs, open/closed, question subset), the
 * public /f/<slug> page (open, closed, unknown), the default /inquire form
 * unchanged, and the admin editor (live slug check, clash, save).
 * Run: pnpm -C apps/web test named-lead-forms
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  formSlugProblem,
  leadFormIsOpen,
  parseNamedForm,
  questionsForForm,
  suggestFormSlug,
  todayIn,
  type FormQuestion,
} from '@shared/index';

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { outcome: 'created' }, error: null as unknown })),
  rpc: vi.fn<[string, unknown?], Promise<{ data: unknown; error: unknown }>>(async () => ({ data: null, error: null })),
  slugFree: vi.fn(async () => true),
  save: vi.fn(async () => 'f-new'),
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
      select: () => ({ eq: () => ({ single: async () => ({ data: { lead_form: { presets: { child_name: { enabled: true, required: false } }, custom: [] } }, error: null }) }) }),
    }),
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}(${Object.values(o).join(',')})` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet', vertical: 'dance-studio', business_preset: 'programs' }),
}));
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 'creativeballet' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn(async () => undefined) } }));
vi.mock('@/features/crm/services/leadFormsService', () => ({
  isFormSlugFree: h.slugFree,
  saveNamedForm: h.save,
  listFormOfferings: async () => [{ id: 'off-1', name: 'Ballet 1', offering_type: 'class' }],
  listNamedForms: async () => [],
  namedFormCounts: async () => ({}),
  deleteNamedForm: vi.fn(),
  uploadFormImage: vi.fn(),
}));

import NamedFormPage from '@/pages/NamedFormPage';
import { InquiryForm } from '@/features/crm/components/InquiryForm';
import { NamedFormsManager, namedFormState } from '@/features/crm/components/NamedFormsManager';

function wrap(ui: ReactNode, url: string, path = '*') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('shared rules', () => {
  it.each([
    ['grade2', null],
    ['kotel-shoot', null],
    ['', 'empty'],
    ['-x', 'format'],
    ['x-', 'format'],
    ['Grade2', 'format'],
    ['a'.repeat(41), 'format'],
    ['inquire', 'reserved'],
    ['embed', 'reserved'],
  ])('slug %s → %s', (slug, problem) => {
    expect(formSlugProblem(slug)).toBe(problem);
  });

  it('suggests a slug from the name; Hebrew-only names give none', () => {
    expect(suggestFormSlug('Grade 2 – Sunday!')).toBe('grade-2-sunday');
    expect(suggestFormSlug('שיעור ניסיון')).toBe('');
  });

  it('a form is open until the end of its last day, and closed when switched off', () => {
    expect(leadFormIsOpen({ active: true, ends_on: null }, '2026-11-02')).toBe(true);
    expect(leadFormIsOpen({ active: true, ends_on: '2026-11-02' }, '2026-11-02')).toBe(true);
    expect(leadFormIsOpen({ active: true, ends_on: '2026-11-01' }, '2026-11-02')).toBe(false);
    expect(leadFormIsOpen({ active: false, ends_on: null }, '2026-11-02')).toBe(false);
    expect(namedFormState({ active: true, ends_on: '2026-11-01' }, '2026-11-02')).toBe('ended');
    expect(namedFormState({ active: false, ends_on: null }, '2026-11-02')).toBe('off');
  });

  it("uses the studio's day in Israel", () => {
    // 22:30 UTC on 1 Nov is already 2 Nov in Israel (UTC+2).
    expect(todayIn('Asia/Jerusalem', new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-02');
  });

  it('a form asks only its chosen questions, in the studio order; null = all', () => {
    const qs = [{ key: 'child_name' }, { key: 'experience' }, { key: 'c_x' }] as FormQuestion[];
    expect(questionsForForm(qs, ['c_x', 'child_name']).map((q) => q.key)).toEqual(['child_name', 'c_x']);
    expect(questionsForForm(qs, null)).toHaveLength(3);
    expect(questionsForForm(qs, [])).toHaveLength(0);
  });

  it('reads the public form safely', () => {
    expect(parseNamedForm({ status: 'closed', title_en: 'leak' })).toEqual({ status: 'closed' });
    expect(parseNamedForm(null)).toBeNull();
    expect(parseNamedForm({ status: 'open' })).toBeNull();
  });
});

describe('/f/<slug>', () => {
  it('an open form shows its own title and intro, and sends its slug with the chosen class', async () => {
    h.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_named_lead_form') {
        return {
          data: { status: 'open', id: 'f-1', slug: 'grade2', title_en: 'Grade 2 trial', intro_en: 'Sundays at 4.', question_keys: [], offering_id: 'off-1' },
          error: null,
        };
      }
      return { data: {}, error: null };
    });
    wrap(<NamedFormPage />, '/f/grade2', '/f/:slug');
    expect(await screen.findByRole('heading', { name: 'Grade 2 trial' })).toBeTruthy();
    expect(screen.getByText('Sundays at 4.')).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith('get_named_lead_form', { p_tenant_id: 't-1', p_slug: 'grade2' });
    fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    const body = (h.invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    // The form asks no questions, so the class is the server's to apply from the form.
    expect(body).toMatchObject({ formSlug: 'grade2', answers: null });
  });

  it('a closed form says so and links to the general form', async () => {
    h.rpc.mockResolvedValue({ data: { status: 'closed' }, error: null });
    wrap(<NamedFormPage />, '/f/old', '/f/:slug');
    expect(await screen.findByRole('heading', { name: 'pages.crm.named_form.closed_title' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'pages.crm.named_form.general_link' }).getAttribute('href')).toBe('/inquire');
    expect(screen.queryByLabelText(/pages.crm.inquire.name/)).toBeNull();
  });

  it('an embedded closed form links to the embedded general form', async () => {
    h.rpc.mockResolvedValue({ data: { status: 'closed' }, error: null });
    wrap(<NamedFormPage embedded />, '/embed/f/old', '/embed/f/:slug');
    expect((await screen.findByRole('link', { name: 'pages.crm.named_form.general_link' })).getAttribute('href')).toBe('/embed/inquire');
  });

  it('an unknown form says it was not found', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    wrap(<NamedFormPage />, '/f/nope', '/f/:slug');
    expect(await screen.findByRole('heading', { name: 'pages.crm.named_form.not_found_title' })).toBeTruthy();
  });
});

describe('/inquire is unchanged', () => {
  it('sends no form slug and its usual title', async () => {
    h.rpc.mockResolvedValue({ data: {}, error: null });
    wrap(<InquiryForm />, '/inquire');
    expect(screen.getByRole('heading', { name: 'pages.crm.inquire.title' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    const body = (h.invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(body.formSlug).toBeNull();
  });
});

describe('forms editor', () => {
  it('suggests the link from the name, checks it live, and refuses a clash', async () => {
    h.slugFree.mockResolvedValue(false);
    wrap(<NamedFormsManager />, '/admin/leads/forms');
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.named_forms.add' }));
    fireEvent.change(screen.getByLabelText(/pages.crm.named_forms.name/), { target: { value: 'Grade 2' } });
    const slug = screen.getByLabelText(/pages.crm.named_forms.slug/) as HTMLInputElement;
    expect(slug.value).toBe('grade-2');
    await waitFor(() => expect(screen.getByText('pages.crm.named_forms.slug_taken')).toBeTruthy());
    expect(h.slugFree).toHaveBeenCalledWith('t-1', 'grade-2', undefined);
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses reserved words before asking the server', async () => {
    wrap(<NamedFormsManager />, '/admin/leads/forms');
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.named_forms.add' }));
    fireEvent.change(screen.getByLabelText(/pages.crm.named_forms.slug/), { target: { value: 'inquire' } });
    expect(await screen.findByText('pages.crm.named_forms.slug_reserved')).toBeTruthy();
    expect(h.slugFree).not.toHaveBeenCalled();
  });

  it('saves the form with its class, last day and chosen questions', async () => {
    h.slugFree.mockResolvedValue(true);
    wrap(<NamedFormsManager />, '/admin/leads/forms');
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.named_forms.add' }));
    fireEvent.change(screen.getByLabelText(/pages.crm.named_forms.name/), { target: { value: 'Grade 2' } });
    fireEvent.change(screen.getByLabelText('pages.crm.named_forms.title_en'), { target: { value: 'Grade 2 trial' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ballet 1' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('pages.crm.named_forms.offering'), { target: { value: 'off-1' } });
    fireEvent.change(screen.getByLabelText('pages.crm.named_forms.ends_on'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(screen.getByText('pages.crm.named_forms.slug_free')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('pages.crm.named_forms.questions_all'));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({
        name: 'Grade 2',
        slug: 'grade-2',
        title_en: 'Grade 2 trial',
        offering_id: 'off-1',
        ends_on: '2026-12-31',
        active: true,
        question_keys: ['child_name'],
      }),
      undefined,
    );
  });
});

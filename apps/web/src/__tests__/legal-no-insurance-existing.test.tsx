// @vitest-environment jsdom
/**
 * Owner decision for studios with no insurance whose health declaration is
 * already active: (a) one click adds the no-insurance sentence as a new,
 * active version, after a clear "parents will sign again" confirm; and a
 * dismissible, non-blocking reminder wherever an admin sends a form link.
 * Run: pnpm -C apps/web test legal-no-insurance-existing.test.tsx
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  profile: {} as Record<string, string>,
  vertical: 'dance-studio',
  templates: [] as Array<Record<string, unknown>>,
  createDraft: vi.fn(),
  activateTemplate: vi.fn(),
}));
const TENANT = { id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet' };
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => TENANT,
  useTenantQuery: () => ({ tenant: TENANT, isLoading: false, notFound: false }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/legal/useLegalDocument', () => ({
  useTenantLegalProfile: () => ({ data: { tenantId: 't-1', vertical: h.vertical, profile: h.profile }, isLoading: false }),
}));
vi.mock('@/features/waivers/hooks/useWaiverTemplates', () => ({
  useWaiverTemplates: () => ({ templates: h.templates }),
}));
vi.mock('@/features/waivers/service', () => ({
  WaiverService: { createDraft: h.createDraft, activateTemplate: h.activateTemplate },
}));

import i18n from '@/i18n/i18n';
import { NO_INSURANCE_DECLARATION, studioSignedForms } from '@shared/legal/signed-template';
import { formsMissingNoInsuranceNote, withNoInsuranceNote } from '@/legal/noInsuranceForm';
import { NoInsuranceFormUpdate } from '@/components/legal/NoInsuranceFormUpdate';
import { NoInsuranceSendReminder } from '@/components/legal/NoInsuranceSendReminder';
import { SendAdminWaiverLinkModal } from '@/features/enrolment/components/SendAdminWaiverLinkModal';
import type { ConsentTemplate, Tenant } from '@shared/schemas';

const ctx = (lang: 'he' | 'en', profile: Record<string, string>) => ({
  lang,
  tenantName: 'Creative Ballet',
  contactEmail: 'a@b.c',
  profile,
});
const healthForm = (lang: 'he' | 'en', profile: Record<string, string> = {}) =>
  studioSignedForms('dance-studio', ctx(lang, profile))[0];

/** A form stored before the no-insurance sentence existed (as an insured studio's form reads). */
function stored(lang: 'he' | 'en', profile: Record<string, string> = { insurance_status: 'insured' }) {
  const f = healthForm(lang, profile);
  return { id: `${lang}-1`, name: f.name, content: f.content, status: 'active' as ConsentTemplate['status'], language: lang, audience: f.audience };
}

function wrap(node: ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  h.profile = { insurance_status: 'none' };
  h.vertical = 'dance-studio';
  h.templates = [];
  h.createDraft.mockImplementation(async (_t, input: { name: string }) => ({ id: `new-${input.name}` }));
  h.activateTemplate.mockResolvedValue(undefined);
  window.sessionStorage.clear();
});

afterEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('adding the sentence to a stored health declaration', () => {
  it.each(['en', 'he'] as const)('gives the same text a new no-insurance form gets (%s)', (lang) => {
    const updated = withNoInsuranceNote(stored(lang));
    expect(updated).toBe(healthForm(lang, { insurance_status: 'none' }).content);
    expect(updated).toContain(NO_INSURANCE_DECLARATION[lang]);
  });

  it('works out the language from the text when the form has none', () => {
    const updated = withNoInsuranceNote({ ...stored('he'), language: null });
    expect(updated).toContain(NO_INSURANCE_DECLARATION.he);
  });

  it('leaves a form that already says it, and forms with no Declaration list', () => {
    expect(withNoInsuranceNote(stored('en', { insurance_status: 'none' }))).toBeNull();
    expect(withNoInsuranceNote({ language: 'en', content: 'Service agreement\n\nTerms apply.' })).toBeNull();
  });

  it('only active forms are offered', () => {
    const forms = [stored('en'), { ...stored('he'), status: 'archived' as const }];
    expect(formsMissingNoInsuranceNote(forms).map((f) => f.id)).toEqual(['en-1']);
  });
});

describe('one click: "Add the insurance note to my health declaration"', () => {
  it('confirms that parents sign again, then adds and activates a new version', async () => {
    h.templates = [stored('en'), stored('he')];
    wrap(<NoInsuranceFormUpdate />);
    fireEvent.click(screen.getByRole('button', { name: 'Add the insurance note to my health declarations' }));
    expect(screen.getByText(/parents who already signed will need to sign it again/)).toBeInTheDocument();
    expect(h.createDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add it and use the new version' }));
    expect(await screen.findByRole('status')).toHaveTextContent('The new version with the insurance note is in use');
    expect(h.createDraft).toHaveBeenCalledTimes(2);
    const [, input] = h.createDraft.mock.calls[0];
    expect(input.content).toContain(NO_INSURANCE_DECLARATION.en);
    expect(input.version_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.activateTemplate).toHaveBeenCalledWith(TENANT, `new-${stored('en').name}`);
    expect(h.createDraft.mock.calls[1][1].content).toContain(NO_INSURANCE_DECLARATION.he);
  });

  it('"Not now" changes nothing', () => {
    h.templates = [stored('en')];
    wrap(<NoInsuranceFormUpdate />);
    fireEvent.click(screen.getByRole('button', { name: 'Add the insurance note to my health declaration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(h.createDraft).not.toHaveBeenCalled();
  });

  it('is not shown when insured, or when the forms already say it', () => {
    h.profile = { insurance_status: 'insured' };
    h.templates = [stored('en')];
    const { unmount } = wrap(<NoInsuranceFormUpdate />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    h.profile = { insurance_status: 'none' };
    h.templates = [stored('en', { insurance_status: 'none' })];
    wrap(<NoInsuranceFormUpdate />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is in Hebrew when Hebrew is chosen', async () => {
    await i18n.changeLanguage('he');
    h.templates = [stored('he')];
    wrap(<NoInsuranceFormUpdate />);
    expect(screen.getByRole('button', { name: 'הוספת הערת הביטוח להצהרת הבריאות' })).toBeInTheDocument();
  });
});

describe('reminder before sending a form link', () => {
  it('shows when there is no insurance and hides for the session once dismissed', () => {
    const { unmount } = wrap(<NoInsuranceSendReminder />);
    expect(screen.getByRole('note')).toHaveTextContent('Reminder: your studio has no insurance recorded.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();
    wrap(<NoInsuranceSendReminder />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown when the studio is insured', () => {
    h.profile = { insurance_status: 'insured' };
    wrap(<NoInsuranceSendReminder />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('a dance studio that never answered sees it; studios without health declarations never do', () => {
    h.profile = {};
    const { unmount } = wrap(<NoInsuranceSendReminder />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    unmount();
    window.sessionStorage.clear();
    for (const vertical of ['generic', 'beautician', 'photographer']) {
      h.vertical = vertical;
      const r = wrap(
        <>
          <NoInsuranceSendReminder />
          <NoInsuranceFormUpdate />
        </>,
      );
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      r.unmount();
    }
  });

  it('is in Hebrew when Hebrew is chosen', async () => {
    await i18n.changeLanguage('he');
    wrap(<NoInsuranceSendReminder />);
    expect(screen.getByRole('note')).toHaveTextContent('תזכורת: לא נרשם ביטוח לסטודיו.');
  });

  it('appears in the send-form-link dialog and never blocks Send', () => {
    wrap(
      <SendAdminWaiverLinkModal
        open
        onClose={() => {}}
        tenant={TENANT as unknown as Tenant}
        engagementId="e-1"
        studentName="Noa"
        className="Ballet 1"
        guardianEmail="parent@example.com"
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('no insurance recorded');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('pages.admin_enrol.send_waiver_link_action') })).toBeEnabled();
  });
});

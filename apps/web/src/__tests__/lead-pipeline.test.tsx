// @vitest-environment jsdom
/**
 * Class pipeline (step 3): stage lists per kind of studio (photographers
 * unchanged), and the enrolment link on the leads page (enrolled, suggested
 * match, manual link). Auto-linking itself is tested in supabase/tests/lead-pipeline.
 * Run: pnpm -C apps/web test lead-pipeline
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  enrolments: vi.fn(async () => [
    { id: 'e-1', person_id: 'p-1', account_id: 'a-1', student: 'Noa Levi', offering: 'Ballet 1', created_at: '2026-11-01' },
    { id: 'e-2', person_id: 'p-2', account_id: null, student: 'Tamar Cohen', offering: 'Jazz', created_at: '2026-11-01' },
  ]),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}(${Object.values(o).join(',')})` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1' }) }));
vi.mock('@/features/crm/services/leadService', async (orig) => {
  const mod = await orig<typeof import('@/features/crm/services/leadService')>();
  return { ...mod, LeadService: { ...mod.LeadService, enrolments: h.enrolments } };
});

import { CLASS_STAGES, PHOTOGRAPHER_STAGES, stagesFor, type EnrolmentChoice } from '@/features/crm/services/leadService';
import { LeadEnrolmentLink } from '@/features/crm/components/LeadEnrolmentLink';

afterEach(() => {
  vi.clearAllMocks();
});

describe('stages per kind of studio', () => {
  it('photographers keep their pipeline exactly', () => {
    expect(stagesFor('photographer')).toEqual(['new', 'contacted', 'qualified', 'proposal', 'lost']);
    expect(stagesFor('photographer')).toBe(PHOTOGRAPHER_STAGES);
  });

  it('class studios get trial booked → trial done → won', () => {
    for (const v of ['dance-studio', 'generic', 'beautician', null]) expect(stagesFor(v)).toBe(CLASS_STAGES);
    expect(CLASS_STAGES).toEqual(['new', 'contacted', 'trial_booked', 'trial_done', 'won', 'lost']);
  });

  it('a lead already in another stage keeps it in its list', () => {
    expect(stagesFor('dance-studio', 'qualified')).toEqual([...CLASS_STAGES, 'qualified']);
    expect(stagesFor('dance-studio', 'won')).toBe(CLASS_STAGES);
  });
});

const baseLead = {
  id: 'l-1',
  name: 'Dana',
  stage: 'trial_done' as const,
  converted_account_id: null,
  converted_engagement_id: null,
  suggested_engagement_id: null,
};
const noa: EnrolmentChoice = { id: 'e-1', person_id: 'p-1', account_id: 'a-1', student: 'Noa Levi', offering: 'Ballet 1', created_at: '2026-11-01' };

function renderLink(lead: Partial<typeof baseLead> & Record<string, unknown>, onLink = vi.fn(), onDismiss = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LeadEnrolmentLink
        lead={{ ...baseLead, ...lead } as never}
        enrolmentsById={new Map([[noa.id, noa]])}
        onLink={onLink}
        onDismiss={onDismiss}
        busy={false}
      />
    </QueryClientProvider>,
  );
  return { onLink, onDismiss };
}

describe('enrolment link on the leads page', () => {
  it('a won lead shows who enrolled in what', () => {
    renderLink({ stage: 'won', converted_account_id: 'a-1', converted_engagement_id: 'e-1' } as never);
    expect(screen.getByText('pages.crm.pipeline.enrolled(Noa Levi,Ballet 1)')).toBeTruthy();
    expect(screen.queryByText('pages.crm.pipeline.link_enrolment')).toBeNull();
  });

  it('a suggested match can be confirmed or dismissed', () => {
    const { onLink, onDismiss } = renderLink({ suggested_engagement_id: 'e-1' } as never);
    expect(screen.getByText('pages.crm.pipeline.possible_match(Noa Levi,Ballet 1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.pipeline.confirm_match' }));
    expect(onLink).toHaveBeenCalledWith(noa);
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.pipeline.not_this_one' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('links by hand from a search of class enrolments; a student without a family account cannot be linked', async () => {
    const { onLink } = renderLink({});
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.pipeline.link_enrolment' }));
    fireEvent.change(await screen.findByLabelText('pages.crm.pipeline.search_label(Dana)'), { target: { value: 'tamar' } });
    const tamarLink = (await screen.findByText('Tamar Cohen · Jazz')).parentElement!.querySelector('button')!;
    expect(tamarLink.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('pages.crm.pipeline.search_label(Dana)'), { target: { value: 'noa' } });
    fireEvent.click((await screen.findByText('Noa Levi · Ballet 1')).parentElement!.querySelector('button')!);
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-1', account_id: 'a-1' }));
  });

  it('lost leads offer no link', () => {
    renderLink({ stage: 'lost' } as never);
    expect(screen.queryByText('pages.crm.pipeline.link_enrolment')).toBeNull();
  });
});

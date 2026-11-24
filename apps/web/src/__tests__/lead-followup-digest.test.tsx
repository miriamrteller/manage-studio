// @vitest-environment jsdom
/**
 * Daily follow-up digest (step 4): which leads are due, the email (en + he),
 * the leads page overdue markers, and the per-admin opt-out in Settings.
 * The once-a-day rule and opt-out RLS: supabase/tests/lead-digest.
 * Run: pnpm -C apps/web test lead-followup-digest
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  optedOut: false,
  insert: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.optedOut ? { user_id: 'u-1' } : null, error: null }) }) }),
      insert: h.insert,
      delete: () => ({ eq: h.remove }),
    }),
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1' }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u-1' } } }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn(async () => undefined) } }));

import { digestEmail, dueLeads, type DigestLead } from '../../../../supabase/functions/_shared/crm-contract/lead-digest.ts';
import { followUpState } from '@/features/crm/lib/followUp';
import { LeadDigestSetting } from '@/features/settings/components/LeadDigestSetting';

const today = '2026-11-02';
const lead = (over: Partial<DigestLead>): DigestLead => ({
  id: 'l',
  name: 'Dana',
  stage: 'contacted',
  next_follow_up_at: '2026-11-02T00:00:00+00:00',
  converted_account_id: null,
  phone: '050-1234567',
  email: null,
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
  h.optedOut = false;
});

describe('which leads are due', () => {
  it('today and overdue, still open; oldest first', () => {
    const leads = [
      lead({ id: 'today' }),
      lead({ id: 'late', next_follow_up_at: '2026-10-30T00:00:00+00:00' }),
      lead({ id: 'tomorrow', next_follow_up_at: '2026-11-03T00:00:00+00:00' }),
      lead({ id: 'none', next_follow_up_at: null }),
      lead({ id: 'won', stage: 'won' }),
      lead({ id: 'lost', stage: 'lost' }),
      lead({ id: 'converted', converted_account_id: 'a-1' }),
    ];
    expect(dueLeads(leads, today).map((l) => l.id)).toEqual(['late', 'today']);
  });
});

describe('digest email', () => {
  const leads = [lead({ id: 'late', name: 'A <b>', next_follow_up_at: '2026-10-30T00:00:00+00:00', stage: 'trial_booked' }), lead({ id: 't', name: 'Noa' })];

  it('English: count, overdue marked, stage named, names escaped, links to leads and settings', () => {
    const e = digestEmail({ studio: 'Ballet', leads, today, leadsUrl: 'https://b.opalswift.com/admin/leads', settingsUrl: 'https://b.opalswift.com/admin/settings', lang: 'en' });
    expect(e.subject).toBe('2 leads to follow up today – Ballet');
    expect(e.html).toContain('A &lt;b&gt;</b> <span style="color:#B91C1C">(overdue)</span>');
    expect(e.html).toContain('Trial booked');
    expect(e.html).toContain('href="https://b.opalswift.com/admin/leads"');
    expect(e.html).toContain('href="https://b.opalswift.com/admin/settings"');
    expect(e.text).toContain('- Noa: Contacted · 050-1234567');
  });

  it('Hebrew: right-to-left, singular subject', () => {
    const e = digestEmail({ studio: 'בלט', leads: [lead({})], today, leadsUrl: 'x', settingsUrl: 'y', lang: 'he' });
    expect(e.html).toContain('dir="rtl"');
    expect(e.subject).toBe('ליד אחד למעקב היום – בלט');
  });
});

describe('leads page markers', () => {
  it.each([
    [{ next_follow_up_at: '2026-11-01T00:00:00+00:00' }, 'overdue'],
    [{ next_follow_up_at: '2026-11-02T00:00:00+00:00' }, 'today'],
    [{ next_follow_up_at: '2026-11-05T00:00:00+00:00' }, null],
    [{ next_follow_up_at: null }, null],
    [{ next_follow_up_at: '2026-11-01T00:00:00+00:00', stage: 'won' }, null],
    [{ next_follow_up_at: '2026-11-01T00:00:00+00:00', converted_account_id: 'a' }, null],
  ])('%o → %s', (over, expected) => {
    expect(followUpState({ stage: 'new', converted_account_id: null, ...over } as never, today)).toBe(expected);
  });
});

describe('opt-out in Settings', () => {
  const renderIt = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LeadDigestSetting />
      </QueryClientProvider>,
    );

  it('is on by default and switching it off adds this admin only', async () => {
    renderIt();
    const box = (await screen.findByRole('checkbox')) as HTMLInputElement;
    await waitFor(() => expect(box.checked).toBe(true));
    fireEvent.click(box);
    await waitFor(() => expect(h.insert).toHaveBeenCalledWith({ user_id: 'u-1', tenant_id: 't-1' }));
  });

  it('switching it back on removes the opt-out', async () => {
    h.optedOut = true;
    renderIt();
    const box = (await screen.findByRole('checkbox')) as HTMLInputElement;
    await waitFor(() => expect(box.checked).toBe(false));
    fireEvent.click(box);
    await waitFor(() => expect(h.remove).toHaveBeenCalledWith('user_id', 'u-1'));
  });
});

// @vitest-environment jsdom
/**
 * Classes with no end date (payments follow-up): a studio with no terms can still add a class
 * (e.g. hq's monthly plans). The form says the class goes in "Ongoing"; saving finds or creates
 * that term. A studio with terms still chooses one. Fakes only.
 * Run: pnpm -C apps/web test class-ongoing-term.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { seasons, inserted } = vi.hoisted(() => ({
  seasons: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/db', () => ({
  TenantDB: {
    selectFor: () => {
      const filters: [string, unknown][] = [];
      const chain = {
        eq: (col: string, val: unknown) => { filters.push([col, val]); return chain; },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: seasons.find((s) => filters.every(([c, v]) => s[c] === v)) ?? null,
          error: null,
        }),
      };
      return chain;
    },
    insert: (_table: string, _tenant: unknown, row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          const created = { id: '22222222-2222-4222-8222-222222222222', tenant_id: '55555555-5555-4555-8555-555555555555', created_at: '2026-11-03T00:00:00Z', ...row };
          inserted.push(row);
          seasons.push(created);
          return { data: created, error: null };
        },
      }),
    }),
  },
}));
vi.mock('@/services/base.service', () => ({
  BaseService: class {
    static async withRetry<T>(fn: () => Promise<T>) { return fn(); }
    static async logAudit() {}
  },
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', payment_provider: 'offline', currency: 'ILS' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key, i18n: { language: 'en' } }),
}));

import { ClassForm } from '../features/classes/components/ClassForm';
import { TermService, ONGOING_TERM_END_DATE } from '../features/terms/service';

afterEach(() => {
  cleanup();
  seasons.length = 0;
  inserted.length = 0;
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('class form without terms', () => {
  it('says the class runs with no end date and saves with no term', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    wrap(<ClassForm terms={[]} levels={[]} teachers={[]} onSubmit={onSubmit} />);
    expect(screen.getByText('form.class.ongoing_term_note')).toBeTruthy();
    expect(screen.queryByLabelText(/form.class.term/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/form.class.name/), { target: { value: 'Studio plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ season_id: null, name: 'Studio plan' });
  });

  it('a studio with terms must still choose one', async () => {
    const onSubmit = vi.fn();
    const term = { id: '11111111-1111-4111-8111-111111111111', name: 'Autumn', status: 'completed', start_date: '2025-09-01' };
    wrap(<ClassForm terms={[term, { ...term, id: '33333333-3333-4333-8333-333333333333', name: 'Spring' }] as never} levels={[]} teachers={[]} onSubmit={onSubmit} />);
    const select = screen.getByLabelText(/form.class.term/) as HTMLSelectElement;
    expect(select.required).toBe(true);
    expect(select.value).toBe('');
    expect(screen.queryByText('form.class.ongoing_term_note')).toBeNull();
    fireEvent.change(screen.getByLabelText(/form.class.name/), { target: { value: 'Ballet' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('TermService.ensureOngoing', () => {
  const tenant = { id: '55555555-5555-4555-8555-555555555555' } as never;

  it('creates an active "Ongoing" term when there is none, then reuses it', async () => {
    const first = await TermService.ensureOngoing(tenant, 'Ongoing');
    expect(inserted).toEqual([expect.objectContaining({ name: 'Ongoing', end_date: ONGOING_TERM_END_DATE, status: 'active' })]);
    const again = await TermService.ensureOngoing(tenant, 'Ongoing');
    expect(again.id).toBe(first.id);
    expect(inserted).toHaveLength(1);
  });

  it('is upcoming, not active, when the studio already has an active term', async () => {
    seasons.push({ id: '44444444-4444-4444-8444-444444444444', tenant_id: '55555555-5555-4555-8555-555555555555', name: 'Autumn', status: 'active', start_date: '2026-09-01', end_date: '2027-01-31', created_at: '2026-01-01T00:00:00Z' });
    await TermService.ensureOngoing(tenant, 'Ongoing');
    expect(inserted[0]).toMatchObject({ status: 'upcoming' });
  });
});

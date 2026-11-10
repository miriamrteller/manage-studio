// @vitest-environment jsdom
/**
 * Client page → Class cards: the admin can give a card more time once. The button stands out
 * when the client asked, and is gone once the card was extended.
 * Run: pnpm -C apps/web test class-card-extend.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonClassCards } from '@/features/class-cards/components/PersonClassCards';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const svc = vi.hoisted(() => ({ extended: [] as string[] }));

vi.mock('@/features/class-cards/service', async (orig) => {
  const actual = await orig<typeof import('@/features/class-cards/service')>();
  const card = { class_count: 10, classes_left: 4, status: 'active', starts_on: '2026-01-01', shared: false, payment_id: null, created_at: '2026-01-01' };
  return {
    ...actual,
    fetchClassCardSettings: async () => ({ tenant_id: 't', enabled: true, cancel_cutoff_hours: 12, extension_months: 2 }),
    fetchPersonClassCards: async () => [
      { ...card, id: 'asked', name: 'Asked card', valid_until: '2999-01-01', extension_requested_at: '2026-11-01', extended_at: null },
      { ...card, id: 'done', name: 'Extended card', valid_until: '2999-01-01', extension_requested_at: '2026-11-01', extended_at: '2026-11-02' },
    ],
    extendClassCard: async (id: string) => void svc.extended.push(id),
  };
});

beforeEach(async () => {
  svc.extended = [];
  setTenant('dance');
  await setLanguage('en');
});

describe('Client page: give a card more time', () => {
  it('extends the card the client asked about, once', async () => {
    renderInApp(<PersonClassCards personId="p-1" />);
    expect(await screen.findByText(/extended once/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Give 2 more months' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(svc.extended).toEqual(['asked']));
  });
});

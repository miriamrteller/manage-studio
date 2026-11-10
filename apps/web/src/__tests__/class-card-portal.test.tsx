// @vitest-environment jsdom
/**
 * Portal → Your class cards: classes left, book a place, cancel with the cutoff shown first,
 * and ask once for more time.
 * Run: pnpm -C apps/web test class-card-portal.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PortalClassCards } from '@/features/class-cards/components/PortalClassCards';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

const svc = vi.hoisted(() => ({
  booked: [] as unknown[],
  cancelled: [] as string[],
  asked: [] as string[],
}));

vi.mock('@/features/class-cards/service', async (orig) => {
  const actual = await orig<typeof import('@/features/class-cards/service')>();
  const soon = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const later = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  return {
    ...actual,
    fetchMyClassCards: async () => [
      {
        id: 'card-1', person_id: 'p-1', name: '10 classes', class_count: 10, classes_left: 7, status: 'active',
        starts_on: '2026-01-01', valid_until: '2999-01-01', shared: false, extension_requested_at: null, extended_at: null,
      },
    ],
    fetchMyCardSessions: async () => ({
      cancel_cutoff_hours: 12,
      sessions: [
        { offering_id: 'o-1', name: 'Yoga', location: null, session_date: later.slice(0, 10), starts_at: later,
          is_session: true, places_left: 4, visit_id: null, visit_status: null, visit_person_id: null },
        { offering_id: 'o-2', name: 'Pilates', location: null, session_date: soon.slice(0, 10), starts_at: soon,
          is_session: true, places_left: 2, visit_id: 'v-1', visit_status: 'booked', visit_person_id: 'p-1' },
      ],
    }),
    bookWithCard: async (...args: unknown[]) => void svc.booked.push(args),
    cancelCardBooking: async (id: string) => {
      svc.cancelled.push(id);
      return 'late_cancelled';
    },
    askForMoreTime: async (id: string) => void svc.asked.push(id),
  };
});

beforeEach(async () => {
  svc.booked = [];
  svc.cancelled = [];
  svc.asked = [];
  setTenant('dance');
  await setLanguage('en');
});

describe('Portal class cards', () => {
  it('shows classes left and books a place', async () => {
    renderInApp(<PortalClassCards myPersonId="p-1" />);
    expect(await screen.findByText(/7 of 10 classes left/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Book a class' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Book' }));
    await waitFor(() => expect(svc.booked).toHaveLength(1));
    expect(svc.booked[0]).toEqual(['card-1', 'o-1', expect.any(String), undefined]);
  });

  it('a late cancel says the class will be used before it cancels', async () => {
    renderInApp(<PortalClassCards myPersonId="p-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Book a class' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/too late to get the class back/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    await waitFor(() => expect(svc.cancelled).toEqual(['v-1']));
    expect(await screen.findByText(/Because it was late, the class was used/)).toBeInTheDocument();
  });

  it('asks for more time', async () => {
    renderInApp(<PortalClassCards myPersonId="p-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for more time' }));
    await waitFor(() => expect(svc.asked).toEqual(['card-1']));
  });
});

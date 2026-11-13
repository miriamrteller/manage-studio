// @vitest-environment jsdom
/**
 * Online booking is open by default: with no hours saved, the booking settings
 * page shows Sunday to Thursday 09:00-18:00 prefilled with a note, and the
 * owner can block off times she can't do (saved straight away). EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import BookingSettingsPage from '@/pages/BookingSettingsPage';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useFeatureGate', () => ({ useFeatureGate: () => ({ hasFeature: () => true, isLoading: false }) }));
vi.mock('@/features/scheduling/components/GoogleCalendarSettings', () => ({ GoogleCalendarSettings: () => null }));

const state = vi.hoisted(() => ({
  hours: [] as Array<{ day_of_week: number; start_time: string; end_time: string; is_active: boolean }>,
  blocks: [] as Array<{ id: string; summary: string; start_time: string; end_time: string }>,
  createBlock: vi.fn(),
}));

vi.mock('@/features/scheduling/bookingSettingsService', async (orig) => {
  const real = await orig<typeof import('@/features/scheduling/bookingSettingsService')>();
  return {
    ...real,
    BookingSettingsService: {
      getSettings: async () => ({ ...real.DEFAULT_BOOKING_SETTINGS, is_booking_enabled: true }),
      getHours: async () => state.hours,
      saveSettings: vi.fn(),
      saveHours: vi.fn(),
    },
  };
});
vi.mock('@/features/scheduling/service', () => ({
  ScheduleService: {
    listUpcomingBlocks: async () => state.blocks,
    createBlock: (...a: unknown[]) => state.createBlock(...a),
    deleteBlock: vi.fn(),
  },
}));

describe('Booking open by default', () => {
  beforeEach(async () => {
    state.hours = [];
    state.blocks = [];
    state.createBlock.mockReset().mockResolvedValue({});
    setTenant('photographer');
    await setLanguage('en');
  });

  it('prefills Sunday to Thursday 09:00-18:00 when no hours are saved', async () => {
    renderInApp(<BookingSettingsPage />, { path: '/admin/setup/booking' });
    expect(await screen.findByText(/clients can book Sunday to Thursday, 9:00 to 18:00/)).toBeTruthy();
    const starts = screen.getAllByLabelText('From') as HTMLInputElement[];
    expect(starts).toHaveLength(5);
    expect(starts.every((i) => i.value === '09:00')).toBe(true);
    expect((screen.getAllByLabelText('To') as HTMLInputElement[]).every((i) => i.value === '18:00')).toBe(true);
  });

  it('shows saved hours as they are, without the note', async () => {
    state.hours = [{ day_of_week: 5, start_time: '08:00', end_time: '12:00', is_active: true }];
    renderInApp(<BookingSettingsPage />, { path: '/admin/setup/booking' });
    await waitFor(() => expect(screen.getAllByLabelText('From')).toHaveLength(1));
    expect(screen.queryByText(/clients can book Sunday to Thursday/)).toBeNull();
  });

  it('blocks a whole day straight away', async () => {
    renderInApp(<BookingSettingsPage />, { path: '/admin/setup/booking' });
    expect(await screen.findByText('No blocked times yet.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2099-11-15' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Away' } });
    fireEvent.click(screen.getByRole('button', { name: 'Block this time' }));
    await waitFor(() => expect(state.createBlock).toHaveBeenCalled());
    expect(state.createBlock.mock.calls[0][1]).toEqual({
      start_time: '2099-11-14T22:00:00.000Z',
      end_time: '2099-11-15T22:00:00.000Z',
      summary: 'Away',
    });
  });

  it('lists blocked times', async () => {
    state.blocks = [{ id: 'b1', summary: 'Wedding', start_time: '2099-11-15T08:00:00.000Z', end_time: '2099-11-15T10:00:00.000Z' }];
    renderInApp(<BookingSettingsPage />, { path: '/admin/setup/booking' });
    expect(await screen.findByText('Sun 15 Nov, 10:00 – 12:00')).toBeTruthy();
    expect(screen.getByText(/Wedding/)).toBeTruthy();
  });

  it('has Hebrew text', async () => {
    await setLanguage('he');
    renderInApp(<BookingSettingsPage />, { path: '/admin/setup/booking' });
    expect(await screen.findByRole('heading', { name: 'זמנים שאתם לא פנויים' })).toBeTruthy();
    expect(await screen.findByText(/ראשון עד חמישי/)).toBeTruthy();
  });
});

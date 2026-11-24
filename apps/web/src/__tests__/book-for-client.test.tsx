import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const svc = vi.hoisted(() => ({
  createHold: vi.fn(),
  prepareCheckout: vi.fn(),
  listBookableOfferings: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1', subdomain: 'velvet' }) }));
vi.mock('@/features/scheduling/bookingService', () => ({ BookingService: svc }));
vi.mock('@/features/scheduling/components/BookingCalendar', () => ({
  BookingCalendar: ({ onSelectSlot }: { onSelectSlot: (s: { starts_at: string; ends_at: string }) => void }) => (
    <button type="button" onClick={() => onSelectSlot({ starts_at: '2030-01-02T08:00:00Z', ends_at: '2030-01-02T09:00:00Z' })}>
      slot
    </button>
  ),
}));
vi.mock('@/lib/supabase', () => {
  const q = {
    select: () => q,
    eq: () => q,
    not: () => q,
    order: () => Promise.resolve({ data: [{ name: 'Dana Levi', email: 'dana@example.test', phone: '050-0000000' }], error: null }),
  };
  return { supabase: { from: () => q } };
});

import { BookForClientPanel } from '@/features/scheduling/components/BookForClientPanel';

beforeEach(() => {
  svc.listBookableOfferings.mockResolvedValue([{ id: 'o-1', name: 'Facial', duration_mins: 60, price_minor: 20000, currency: 'ILS' }]);
  svc.createHold.mockResolvedValue({ hold_id: 'h-1', expires_at: '2030-01-01T00:00:00Z' });
  svc.prepareCheckout.mockResolvedValue({ engagement_id: 'e-1', hold_id: 'h-1', token: 'x', redirect_path: '/enrol/pay/e-1?t=x' });
});

describe('Diary: Book for a client', () => {
  it('a known client fills in, the only service is picked, and one button books', async () => {
    const onBooked = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BookForClientPanel onBooked={onBooked} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'scheduling.diary.book_for_client' }));
    await waitFor(() => expect(svc.listBookableOfferings).toHaveBeenCalledWith('velvet'));
    expect(screen.queryByLabelText('scheduling.appointments.service')).toBeNull();

    // Wait for the client list, then pick the known name.
    await waitFor(() => expect(document.querySelector('datalist option')).not.toBeNull());
    fireEvent.change(screen.getByLabelText('scheduling.book.name'), { target: { value: 'Dana Levi' } });
    expect((screen.getByLabelText('scheduling.book.email') as HTMLInputElement).value).toBe('dana@example.test');
    expect((screen.getByLabelText('scheduling.book.phone') as HTMLInputElement).value).toBe('050-0000000');

    fireEvent.click(await screen.findByRole('button', { name: 'slot' }));
    fireEvent.click(screen.getByRole('button', { name: 'scheduling.diary.book_at' }));

    await waitFor(() => expect(onBooked).toHaveBeenCalledOnce());
    expect(svc.createHold).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: 'velvet', offeringId: 'o-1', clientEmail: 'dana@example.test' }),
    );
    expect(svc.prepareCheckout).toHaveBeenCalledWith(expect.objectContaining({ holdId: 'h-1' }));
    expect(screen.getByRole('status').textContent).toContain('scheduling.diary.booked_for_client');
    expect(screen.getByRole('button', { name: 'scheduling.diary.copy_pay_link' })).toBeTruthy();
  });
});

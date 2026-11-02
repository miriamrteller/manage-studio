// @vitest-environment jsdom
/**
 * Cancel an ACTIVE enrolment (payments follow-up 3): the student panel offers Cancel on an
 * active place too; the dialog says monthly charges stop and calls cancel_active_engagement
 * (the database cancels the place and its billing schedule, see supabase/tests/cancel-active).
 * A place before payment keeps cancel_engagement. Fakes only.
 * Run: pnpm -C apps/web test cancel-active-enrolment.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ENGAGEMENT = '11111111-1111-4111-8111-111111111111';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { CancelEnrolmentDialog } from '../features/students/components/CancelEnrolmentDialog';
import { canCancelActiveEnrolment, canShowCancelEnrolment } from '../features/students/components/EnrolmentRowActions';

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

function engagementRow(status: string) {
  return {
    id: ENGAGEMENT,
    tenant_id: '22222222-2222-4222-8222-222222222222',
    person_id: '33333333-3333-4333-8333-333333333333',
    offering_id: '44444444-4444-4444-8444-444444444444',
    status,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  };
}

describe('which places can be cancelled', () => {
  it('an active place can now be cancelled, alongside places before payment', () => {
    expect(canCancelActiveEnrolment('active')).toBe(true);
    expect(canShowCancelEnrolment('active')).toBe(true);
    expect(canShowCancelEnrolment('pending_payment')).toBe(true);
    expect(canShowCancelEnrolment('cancelled')).toBe(false);
    expect(canCancelActiveEnrolment('pending_payment')).toBe(false);
  });
});

describe('CancelEnrolmentDialog', () => {
  it('active: says monthly charges stop and calls cancel_active_engagement with the reason', async () => {
    rpc.mockResolvedValue({ data: engagementRow('cancelled'), error: null });
    const onOpenChange = vi.fn();
    wrap(
      <CancelEnrolmentDialog open onOpenChange={onOpenChange} engagementId={ENGAGEMENT} personId="p1" studentName="Noa" className="Ballet" active />,
    );
    expect(screen.getByText('pages.students.cancel_enrolment_confirm_active')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('pages.students.cancel_enrolment_reason_label'), { target: { value: ' Moving ' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.students.cancel_enrolment_button' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('cancel_active_engagement', { p_engagement_id: ENGAGEMENT, p_reason: 'Moving' }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('before payment: keeps cancel_engagement and its wording', async () => {
    rpc.mockResolvedValue({ data: engagementRow('cancelled'), error: null });
    wrap(<CancelEnrolmentDialog open onOpenChange={vi.fn()} engagementId={ENGAGEMENT} personId="p1" studentName="Noa" className="Ballet" />);
    expect(screen.getByText('pages.students.cancel_enrolment_confirm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'pages.students.cancel_enrolment_button' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('cancel_engagement', expect.objectContaining({ p_engagement_id: ENGAGEMENT })));
  });

  it('shows an error the database returns', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Engagement cannot be cancelled from status pending_waiver' } });
    wrap(<CancelEnrolmentDialog open onOpenChange={vi.fn()} engagementId={ENGAGEMENT} personId="p1" studentName="Noa" className="Ballet" active />);
    fireEvent.click(screen.getByRole('button', { name: 'pages.students.cancel_enrolment_button' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pages.students.cancel_enrolment_error_invalid_status');
  });
});

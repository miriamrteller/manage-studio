// @vitest-environment jsdom
/**
 * Owner, 13 Nov 2026 (fewest taps): with the parent's email known, choosing a class and pressing
 * one button enrols and emails the pay link. "Other ways to pay" keeps the old payment step.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CLASS = {
  id: 'c1',
  name: 'Ballet 1',
  season_id: 's1',
  price_minor: 20000,
  currency: 'ILS',
  start_time: '16:00',
  location: null,
  category_id: null,
  min_age: null,
  max_age: null,
};
const TENANT = { id: 't1', name: 'Studio', subdomain: 'studio', currency: 'ILS' };

const h = vi.hoisted(() => ({
  create: vi.fn(),
  sendLink: vi.fn(),
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => TENANT,
  useTenantQuery: () => ({ tenant: TENANT, isLoading: false }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/features/classes/hooks/useClasses', () => ({
  useClasses: () => ({ classes: [CLASS], isLoading: false, error: null }),
}));
vi.mock('@/features/terms/hooks/useTerms', () => ({ useTerms: () => ({ terms: [] }) }));
vi.mock('@/features/levels/hooks/useLevels', () => ({ useLevels: () => ({ levels: [] }) }));
vi.mock('@/features/enrolment/hooks/useEnrolmentClassPicker', () => ({
  useEnrolmentClassPicker: () => ({
    displayClasses: [CLASS],
    enrolledKeysLoading: false,
    ageFilteringActive: false,
    getClassAvailability: () => ({ available: true }),
    classSeasonStartDate: () => null,
    isClassAlreadyEnrolled: () => false,
    isClassAgeEligible: () => true,
    seasonStartById: new Map(),
    availableClasses: [CLASS],
  }),
}));
vi.mock('@/features/enrolment/service', () => ({ EnrolmentService: { create: h.create } }));
vi.mock('@/features/enrolment/lib/adminEnrolmentService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/enrolment/lib/adminEnrolmentService')>()),
  AdminEnrolmentService: { sendPaymentLinkEmail: h.sendLink },
}));
vi.mock('@/components/ui/modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: unknown }) => (isOpen ? <div role="dialog">{children as never}</div> : null),
}));
vi.mock('@/features/enrolment/components/EnrolmentClassSelectList', () => ({
  EnrolmentClassSelectList: ({ onSelectClass }: { onSelectClass: (c: unknown) => void }) => (
    <button type="button" onClick={() => onSelectClass(CLASS)}>
      pick Ballet 1
    </button>
  ),
}));

import i18n from '@/i18n/i18n';
import { AdminEnrolStudentModal } from '@/features/enrolment/components/AdminEnrolStudentModal';

function renderModal(guardianEmail: string | null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <AdminEnrolStudentModal
          isOpen
          personId="p1"
          personName="Child"
          personDateOfBirth={null}
          familyId="f1"
          guardianEmail={guardianEmail}
          guardianName="Parent"
          onClose={() => undefined}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.create.mockReset().mockResolvedValue({ id: 'e1' });
  h.sendLink.mockReset().mockResolvedValue({ emailSent: true, paymentUrl: 'https://x/pay' });
});

describe('Enrol in class: one step with the parent email known', () => {
  it('pick a class, one button: enrolled and the pay link emailed', async () => {
    renderModal('parent@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'pick Ballet 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enrol and email the pay link to parent@example.com' }));
    await waitFor(() => expect(h.sendLink).toHaveBeenCalled());
    expect(h.create).toHaveBeenCalledWith(TENANT, expect.objectContaining({ person_id: 'p1', offering_id: 'c1', status: 'pending_payment' }));
    expect(h.sendLink).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ recipientEmail: 'parent@example.com', engagementId: 'e1', className: 'Ballet 1' }),
    );
    expect(await screen.findByText(/parent@example.com/)).toBeInTheDocument();
  });

  it('no email known: the usual Next to the payment choices', () => {
    renderModal(null);
    expect(screen.queryByRole('button', { name: /Enrol and email/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * Photography contracts: one agree tick instead of the long scrolling text (owner decision).
 * The full contract is one click away, there is no scroll gate, and that single tick is what
 * the signed record keeps as the confirmation wording. Other forms keep the scroll and two ticks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { WaiverStep } from '@/features/enrolment/components/WaiverStep';
import { renderInApp, setTenant } from './helpers/verticalHarness';
import { fillSignerDetails } from './helpers/signerDetails';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }),
}));

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn(),
  },
}));

/** Never reports the end of the text as seen: the one-tick contract must not depend on scrolling. */
class NeverIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const TEMPLATE = { id: '11111111-1111-4111-8111-111111111111', version: 1, name: 'Photography contract', content: 'Full contract text', language: null };
const AGREE =
  'I have read and agree to the contract, my details above are correct, and I understand that typing my name and ticking this box is my electronic signature.';

const calls = (name: string) => invoke.mock.calls.filter((c) => c[0] === name);

function renderContract() {
  return renderInApp(
    <WaiverStep
      personId="22222222-2222-4222-8222-222222222222"
      template={TEMPLATE}
      offeringId="33333333-3333-4333-8333-333333333333"
      waiverToken="wt"
      isJobContract
      onComplete={() => undefined}
      onPrevious={() => undefined}
      canGoBack={false}
    />,
  );
}

beforeEach(() => {
  setTenant('photographer');
  vi.stubGlobal('IntersectionObserver', NeverIntersectionObserver);
  invoke.mockImplementation(async (name: string) =>
    name === 'waiver-viewed'
      ? { data: { view_token: 'vt', viewed_at_ts: Math.floor(Date.now() / 1000) }, error: null }
      : { data: { evidence_id: 'ev-1' }, error: null },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

describe('photography contract: one tick', () => {
  it('shows one agree tick, no long text and no scroll prompt; the full contract opens from the link', async () => {
    renderContract();
    expect(await screen.findByRole('checkbox', { name: AGREE })).toBeInTheDocument();
    expect(screen.queryByText('Full contract text')).not.toBeInTheDocument();
    expect(screen.queryByText(/Scroll to the bottom/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'These details are correct' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read the full contract' }));
    expect(screen.getByText('Full contract text')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the contract' }));
    expect(screen.queryByText('Full contract text')).not.toBeInTheDocument();
  });

  it('signs with the one tick and records its wording as the confirmation', async () => {
    renderContract();
    await waitFor(() => expect(calls('waiver-viewed')).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Dana Levi' } });
    fillSignerDetails({ noConfirmTick: true });
    const sign = screen.getByRole('button', { name: 'Sign contract' });
    expect(sign).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: AGREE }));
    expect(sign).toBeEnabled();
    fireEvent.click(sign);
    await waitFor(() => expect(calls('accept-waiver')).toHaveLength(1));
    const body = calls('accept-waiver')[0][1].body;
    expect(body.view_token).toBe('vt');
    expect(body.signer_details.confirmed).toBe(true);
    expect(body.signer_details.confirmed_wording).toBe(AGREE);
    expect(body.portfolio_consent).toBe(false);
  });
});

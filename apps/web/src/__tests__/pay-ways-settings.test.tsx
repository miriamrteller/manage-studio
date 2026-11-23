// @vitest-environment jsdom
/**
 * Settings › Online payments › "How clients can pay you": one card per way to pay (Bit, bank
 * transfer, cash, cheque), each with an on/off switch; its details show only while it is on;
 * the Bit number starts from the business phone; "What your client sees" follows the
 * switches; Save sends every field and says it is saved. EN + HE.
 * Owner, 23 Nov 2026: for EVERY studio (e.g. a ballet school with no photo shop), not only
 * the photographer. "Card in the photo shop" shows only when the photo shop is on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PayWaysSetting } from '@/features/settings/components/PayWaysSetting';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  photoShop: true,
  saveWays: vi.fn(),
  saveShop: vi.fn(),
  ways: {} as Record<string, unknown>,
  phone: '000-000-0000',
}));

vi.mock('@/legal/useLegalDocument', () => ({
  useTenantLegalProfile: () => ({ data: { profile: { phone: state.phone } } }),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/hooks/usePhotoShop')>();
  return {
    ...real,
    usePhotoShopEnabled: () => state.photoShop,
    useStudioPhotoShopDefaults: () => ({
      defaults: {
        data: { price_per_photo_minor: 3000, all_photos_price_minor: null, gallery_open_days: 90, card_payments: false },
        isLoading: false,
      },
      save: { mutateAsync: state.saveShop, isPending: false, error: null },
    }),
  };
});
vi.mock('@/features/pay-direct/useStudioPayWays', () => ({
  useStudioPayWays: () => ({
    ways: {
      data: {
        accepts_bit: false, bit_phone: null, accepts_bank: false, bank_details: null,
        accepts_cash: false, cash_instructions: null, accepts_cheque: false, cheque_instructions: null,
        ...state.ways,
      },
      isLoading: false,
    },
    save: { mutateAsync: state.saveWays, isPending: false },
  }),
}));

const preview = () => within(screen.getByRole('region', { name: 'What your client sees' }));

describe('How clients can pay you (every studio)', () => {
  beforeEach(() => {
    setTenant('photographer');
    setLanguage('en');
    state.photoShop = true;
    state.saveWays.mockReset().mockResolvedValue(undefined);
    state.saveShop.mockReset().mockResolvedValue(undefined);
    state.ways = {};
  });

  it('photo shop on: one switch per way including card, all off, standard wording', () => {
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    for (const name of ['Card in the photo shop', 'Bit', 'Bank transfer', 'Cash', 'Cheque']) {
      expect((screen.getByRole('switch', { name }) as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.queryByLabelText('Your Bit phone number')).toBeNull();
    expect(preview().getByText('Pay the studio directly (cash, bank transfer or other)')).toBeTruthy();
  });

  it('no photo shop (ballet school): the same ways, no photo shop card switch', () => {
    state.photoShop = false;
    setTenant('dance');
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    expect(screen.getByRole('heading', { name: 'How clients can pay you' })).toBeTruthy();
    for (const name of ['Bit', 'Bank transfer', 'Cash', 'Cheque']) expect(screen.getByRole('switch', { name })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Card in the photo shop' })).toBeNull();
  });

  it('Bit on: the number starts from the business phone and the preview shows it', () => {
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bit' }));
    expect((screen.getByLabelText('Your Bit phone number') as HTMLInputElement).value).toBe('000-000-0000');
    expect(screen.getByText(/Filled in from your business phone/)).toBeTruthy();
    expect(preview().getByText('Pay by Bit')).toBeTruthy();
    expect(preview().getByText('Bit to 000-000-0000')).toBeTruthy();
    expect(preview().getByText(/asked for a screenshot/)).toBeTruthy();
    expect(screen.getByText('Changes not saved yet.')).toBeTruthy();
  });

  it('bank transfer on without details: a note, and clients do not see it yet', () => {
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bank transfer' }));
    expect(screen.getByText('Add your bank details so clients can see bank transfer.')).toBeTruthy();
    expect(preview().queryByText('Pay by bank transfer')).toBeNull();
    fireEvent.change(screen.getByLabelText('Your bank details'), { target: { value: 'Account 1' } });
    expect(preview().getByText('Pay by bank transfer')).toBeTruthy();
    expect(preview().getByText('Account 1')).toBeTruthy();
  });

  it('Save sends every way to the studio-wide settings, card to the photo shop, and says it is saved', async () => {
    state.ways = { accepts_cash: true, cash_instructions: 'At the studio' };
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    expect((screen.getByRole('switch', { name: 'Cash' }) as HTMLInputElement).checked).toBe(true);
    expect(preview().getByText('Pay in cash')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Cheque' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Saved. Clients see these from now on.')).toBeTruthy());
    expect(state.saveWays.mock.calls[0][0]).toEqual({
      accepts_bit: false,
      bit_phone: null,
      accepts_bank: false,
      bank_details: null,
      accepts_cash: true,
      cash_instructions: 'At the studio',
      accepts_cheque: true,
      cheque_instructions: null,
    });
    expect(state.saveShop).toHaveBeenCalledWith({ card_payments: false });
  });

  it('no photo shop: Save never touches the photo shop settings', async () => {
    state.photoShop = false;
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.saveWays).toHaveBeenCalled());
    expect(state.saveShop).not.toHaveBeenCalled();
  });

  it('Hebrew', () => {
    setLanguage('he');
    renderInApp(<PayWaysSetting />, { path: '/admin/settings' });
    expect(screen.getByRole('switch', { name: 'ביט' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'איך הלקוחות יכולים לשלם לך' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'מה הלקוח רואה' })).toBeTruthy();
  });
});

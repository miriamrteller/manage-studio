// @vitest-environment jsdom
/**
 * Settings › Online payments › Photo shop: one card per way to pay (card, Bit, bank transfer,
 * cash, cheque), each with an on/off switch; its details show only while it is on; the Bit
 * number starts from the business phone; "What your client sees" follows the switches; Save
 * sends every field and says it is saved. EN + HE. (Owner, 22 Nov 2026.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { PhotoShopPayWaysSetting } from '@/features/settings/components/PhotoShopPayWaysSetting';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  defaults: {} as Record<string, unknown>,
  phone: '000-000-0000',
}));

vi.mock('@/legal/useLegalDocument', () => ({
  useTenantLegalProfile: () => ({ data: { profile: { phone: state.phone } } }),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/hooks/usePhotoShop')>();
  return {
    ...real,
    usePhotoShopEnabled: () => true,
    useStudioPhotoShopDefaults: () => ({
      defaults: {
        data: { price_per_photo_minor: 3000, all_photos_price_minor: null, gallery_open_days: 90, card_payments: false, ...state.defaults },
        isLoading: false,
      },
      save: { mutate: state.mutate, isPending: false, error: null },
    }),
  };
});

const preview = () => within(screen.getByRole('region', { name: 'What your client sees' }));

describe('Photo shop payment settings', () => {
  beforeEach(() => {
    setTenant('photographer');
    setLanguage('en');
    state.mutate.mockReset();
    state.defaults = {};
  });

  it('shows one switch per way, all off, and the standard wording for clients', () => {
    renderInApp(<PhotoShopPayWaysSetting />, { path: '/admin/settings' });
    for (const name of ['Card', 'Bit', 'Bank transfer', 'Cash', 'Cheque']) {
      const sw = screen.getByRole('switch', { name });
      expect((sw as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.queryByLabelText('Your Bit phone number')).toBeNull();
    expect(preview().getByText('Pay the studio directly (cash, bank transfer or other)')).toBeTruthy();
  });

  it('Bit on: the number starts from the business phone and the preview shows it', () => {
    renderInApp(<PhotoShopPayWaysSetting />, { path: '/admin/settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bit' }));
    expect((screen.getByLabelText('Your Bit phone number') as HTMLInputElement).value).toBe('000-000-0000');
    expect(screen.getByText(/Filled in from your business phone/)).toBeTruthy();
    expect(preview().getByText('Pay by Bit')).toBeTruthy();
    expect(preview().getByText('Bit to 000-000-0000')).toBeTruthy();
    expect(preview().getByText(/asked for a screenshot/)).toBeTruthy();
    expect(screen.getByText('Changes not saved yet.')).toBeTruthy();
  });

  it('bank transfer on without details: a note, and clients do not see it yet', () => {
    renderInApp(<PhotoShopPayWaysSetting />, { path: '/admin/settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bank transfer' }));
    expect(screen.getByText('Add your bank details so clients can see bank transfer.')).toBeTruthy();
    expect(preview().queryByText('Pay by bank transfer')).toBeNull();
    fireEvent.change(screen.getByLabelText('Your bank details'), { target: { value: 'Account 1' } });
    expect(preview().getByText('Pay by bank transfer')).toBeTruthy();
    expect(preview().getByText('Account 1')).toBeTruthy();
  });

  it('Save sends every field and says it is saved', () => {
    state.defaults = { accepts_cash: true, cash_instructions: 'At the studio' };
    state.mutate.mockImplementation((_v, opts: { onSuccess: () => void }) => opts.onSuccess());
    renderInApp(<PhotoShopPayWaysSetting />, { path: '/admin/settings' });
    expect((screen.getByRole('switch', { name: 'Cash' }) as HTMLInputElement).checked).toBe(true);
    expect(preview().getByText('Pay in cash')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Cheque' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.mutate.mock.calls[0][0]).not.toHaveProperty('price_per_photo_minor');
    expect(state.mutate.mock.calls[0][0]).toMatchObject({
      card_payments: false,
      accepts_bit: false,
      accepts_cash: true,
      cash_instructions: 'At the studio',
      accepts_cheque: true,
      cheque_instructions: null,
    });
    expect(screen.getByText('Saved. Clients see these from now on.')).toBeTruthy();
  });

  it('Hebrew', () => {
    setLanguage('he');
    renderInApp(<PhotoShopPayWaysSetting />, { path: '/admin/settings' });
    expect(screen.getByRole('switch', { name: 'ביט' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'מה הלקוח רואה' })).toBeTruthy();
  });
});

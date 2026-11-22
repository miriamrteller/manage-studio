// @vitest-environment jsdom
/**
 * Photo shop > Prices > Prints and other products: with none saved, canvas and wood prints
 * in two sizes are filled in and only prices are left to type; rows without a price are not
 * saved; a name in one language fills the other. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PhotoProductsSetting } from '@/features/settings/components/PhotoProductsSetting';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  products: [] as unknown[],
  mutate: vi.fn(),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/hooks/usePhotoShop')>();
  return {
    ...real,
    usePhotoShopEnabled: () => true,
    useStudioPhotoProducts: () => ({
      products: { data: state.products, isLoading: false },
      save: { mutate: state.mutate, isPending: false, error: null },
    }),
  };
});

describe('PhotoProductsSetting', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.products = [];
    state.mutate.mockReset();
  });

  it('fills in canvas and wood prints; saves only rows with a price', async () => {
    renderInApp(<PhotoProductsSetting />);
    expect(await screen.findByText(/We've added canvas and wood prints/)).toBeTruthy();
    const en = screen.getAllByLabelText('Name (English)') as HTMLInputElement[];
    expect(en.map((i) => i.value)).toEqual(['Canvas print', 'Canvas print', 'Wood print', 'Wood print']);
    const sizes = screen.getAllByLabelText('Size') as HTMLInputElement[];
    expect(sizes.map((i) => i.value)).toEqual(['20x30 cm', '30x45 cm', '20x30 cm', '30x45 cm']);

    const prices = screen.getAllByLabelText(/^Price/);
    fireEvent.change(prices[0], { target: { value: '140' } });
    fireEvent.change(prices[3], { target: { value: '230' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate.mock.calls[0][0]).toEqual([
      { id: undefined, name_en: 'Canvas print', name_he: 'הדפסה על קנבס', size_label: '20x30 cm', price_minor: 14000, position: 0 },
      { id: undefined, name_en: 'Wood print', name_he: 'הדפסה על עץ', size_label: '30x45 cm', price_minor: 23000, position: 1 },
    ]);
  });

  it('shows saved products, and a new row named in one language only', async () => {
    state.products = [{ id: 'p1', name_en: 'Canvas print', name_he: 'הדפסה על קנבס', size_label: '20x30 cm', price_minor: 14000, position: 0 }];
    renderInApp(<PhotoProductsSetting />);
    expect(((await screen.findAllByLabelText(/^Price/))[0] as HTMLInputElement).value).toBe('140');
    expect(screen.queryByText(/We've added/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a product' }));
    fireEvent.change(screen.getAllByLabelText('Name (English)')[1], { target: { value: 'Photo book' } });
    fireEvent.change(screen.getAllByLabelText(/^Price/)[1], { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.mutate.mock.calls[0][0][1]).toEqual({
      id: undefined, name_en: 'Photo book', name_he: 'Photo book', size_label: null, price_minor: 30000, position: 1,
    });
  });

  it('Hebrew: sizes in ס״מ', async () => {
    await setLanguage('he');
    renderInApp(<PhotoProductsSetting />);
    expect(await screen.findByText('הדפסות ומוצרים נוספים')).toBeTruthy();
    const sizes = screen.getAllByLabelText('גודל') as HTMLInputElement[];
    expect(sizes[0].value).toBe('20x30 ס״מ');
  });
});

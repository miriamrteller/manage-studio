// @vitest-environment jsdom
/**
 * Photo shop on the shoot page (beta): hidden without the flag; prefilled
 * prices behind "Details we filled in for you"; saving sends the edits; a paid
 * order is delivered with an https link only. EN + HE text present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { JobPhotoShopCard } from '@/features/jobs/components/JobPhotoShopCard';
import type { JobPhotoShop, PhotoOrder } from '@/features/jobs/services/photoShopService';
import { isDeliveryLink, majorToMinor, minorToMajor } from '@/features/jobs/services/photoShopService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  flag: true,
  shop: null as unknown as JobPhotoShop,
  orders: [] as PhotoOrder[],
  saveShop: vi.fn(),
  deliver: vi.fn(),
  markSent: vi.fn(),
  recordCash: vi.fn(),
  photos: [] as { id: string; file_name: string; storage_path: string; url: string | null }[],
  upload: vi.fn(async (_t: string, _e: string, previews: unknown[]) => previews.length),
  deletePhoto: vi.fn(async (_id: string) => undefined),
  smugmugConnected: false,
  listAlbums: vi.fn(),
  checkGallery: vi.fn(),
}));

vi.mock('@/features/settings/services/smugmugService', async (orig) => {
  const real = await orig<typeof import('@/features/settings/services/smugmugService')>();
  return {
    ...real,
    SmugMugService: {
      ...real.SmugMugService,
      getStatus: async () => ({ hasKeys: state.smugmugConnected, connected: state.smugmugConnected, keysUpdatedAt: null, connectedAt: null }),
      listAlbums: (id: string) => state.listAlbums(id),
      checkGallery: (id: string, key: string) => state.checkGallery(id, key),
    },
  };
});

vi.mock('@/features/jobs/lib/photoPreview', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/lib/photoPreview')>();
  return {
    ...real,
    makePreview: async (file: File) => {
      if (file.name.endsWith('.heic')) throw new real.PreviewError('unreadable');
      return new Blob(['jpeg'], { type: 'image/jpeg' });
    },
  };
});

vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:photo_shop', isLoading: false }),
}));
vi.mock('@/features/jobs/services/jobPaymentService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/jobPaymentService')>();
  return {
    ...real,
    JobPaymentService: { recordManualPayment: (id: string, method: string) => state.recordCash(id, method) },
  };
});

vi.mock('@/features/jobs/services/photoShopService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/photoShopService')>();
  return {
    ...real,
    PhotoShopService: {
      getShop: async () => state.shop,
      listOrders: async () => state.orders,
      saveShop: (id: string, patch: unknown) => state.saveShop(id, patch),
      deliver: (id: string, url: string) => state.deliver(id, url),
      markSent: (id: string) => state.markSent(id),
      listPhotos: async () => state.photos,
      uploadPreviews: (t: string, e: string, previews: unknown[]) => state.upload(t, e, previews),
      deletePhoto: (id: string) => state.deletePhoto(id),
    },
  };
});

const shop = (over: Partial<JobPhotoShop> = {}): JobPhotoShop => ({
  engagement_id: 'e1',
  tenant_id: 't1',
  provider: 'smugmug',
  gallery_key: null,
  gallery_name: null,
  included_photos: 20,
  price_per_photo_minor: 3000,
  all_photos_price_minor: null,
  currency: 'ILS',
  closes_at: '2027-02-02T21:59:59.000Z',
  saved: false,
  ...over,
});

const paidOrder: PhotoOrder = {
  id: 'o1',
  status: 'paid',
  photo_count: 3,
  included_count: 2,
  total_minor: 3000,
  currency: 'ILS',
  all_photos: false,
  delivery_url: null,
  created_at: '2026-11-04T10:00:00Z',
  paid_at: '2026-11-04T10:05:00Z',
  delivered_at: null,
  items: [
    { image_key: 'k1', file_name: 'IMG_0001.jpg', included: true, price_minor: 0 },
    { image_key: 'k2', file_name: 'IMG_0002.jpg', included: true, price_minor: 0 },
    { image_key: 'k3', file_name: 'IMG_0003.jpg', included: false, price_minor: 3000 },
  ],
};

describe('photo shop helpers', () => {
  it('converts prices and checks delivery links', () => {
    expect(majorToMinor('30')).toBe(3000);
    expect(majorToMinor('12,5')).toBe(1250);
    expect(majorToMinor('')).toBeNull();
    expect(majorToMinor('0')).toBeNull();
    expect(minorToMajor(3000)).toBe('30');
    expect(minorToMajor(1250)).toBe('12.50');
    expect(isDeliveryLink('https://studio.smugmug.com/Alice')).toBe(true);
    expect(isDeliveryLink('http://studio.smugmug.com/Alice')).toBe(false);
    expect(isDeliveryLink('javascript:alert(1)')).toBe(false);
  });
});

describe('JobPhotoShopCard', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.flag = true;
    state.shop = shop();
    state.orders = [];
    state.saveShop.mockReset().mockImplementation(async (_id: string, patch: Partial<JobPhotoShop>) => shop({ ...patch, saved: true }));
    state.deliver.mockReset().mockResolvedValue(undefined);
    state.markSent.mockReset().mockResolvedValue(undefined);
    state.photos = [];
    state.upload.mockClear();
    state.deletePhoto.mockClear();
    state.smugmugConnected = false;
    state.listAlbums.mockReset().mockResolvedValue({
      albums: [
        { key: 'a1', name: 'Levi bar mitzvah', imageCount: 12 },
        { key: 'a2', name: 'Cohen family', imageCount: 40 },
      ],
      suggested: 'a2',
    });
    state.checkGallery.mockReset();
  });

  it('is hidden without the photo shop flag', () => {
    state.flag = false;
    const { container } = renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(container.textContent).not.toContain('Photo shop');
  });

  it('shows the prefilled prices and saves edits', async () => {
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByText(/20 photos included · ₪30(\.00)? per photo/)).toBeTruthy();
    expect(screen.getByText('Details we filled in for you')).toBeTruthy();
    expect(screen.getByText(/Not saved yet/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Price per photo (ILS)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('All photos price (ILS, optional)'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.saveShop).toHaveBeenCalled());
    expect(state.saveShop.mock.calls[0][1]).toMatchObject({
      included_photos: 20,
      price_per_photo_minor: 4500,
      all_photos_price_minor: 40000,
    });
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('with 0 included, the summary says nothing about included photos', async () => {
    state.shop = shop({ included_photos: 0 });
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    await screen.findByText(/^₪30(\.00)? per photo · open until/);
    expect(screen.queryByText(/included ·/)).toBeNull();
  });

  it('delivers a paid order with an https link only', async () => {
    state.orders = [paidOrder];
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByText('Paid, to deliver')).toBeTruthy();
    const input = screen.getByLabelText('Download gallery link');
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: 'http://studio.smugmug.com/x' } });
    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'https://studio.smugmug.com/Alice-download' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(state.deliver).toHaveBeenCalledWith('o1', 'https://studio.smugmug.com/Alice-download'));
  });

  it('a paid order shows each photo\'s thumbnail and file name, and can be marked as sent', async () => {
    state.shop = shop({
      provider: 'smugmug',
      gallery_key: 'a1',
      smugmug_photos: [{ key: 'k3', fileName: 'IMG_0003.jpg', previewUrl: 'https://photos.smugmug.test/k3-L.jpg' }],
    });
    state.photos = [{ id: 'k1', file_name: 'IMG_0001.jpg', storage_path: 't1/e1/k1.jpg', url: 'https://signed/k1' }];
    state.orders = [paidOrder];
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByText('Paid, to deliver')).toBeTruthy();
    expect(((await screen.findByAltText('IMG_0001.jpg')) as HTMLImageElement).src).toBe('https://signed/k1');
    expect((screen.getByAltText('IMG_0003.jpg') as HTMLImageElement).src).toBe('https://photos.smugmug.test/k3-L.jpg');
    expect(screen.getByText('IMG_0002.jpg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as sent' }));
    await waitFor(() => expect(state.markSent).toHaveBeenCalledWith('o1'));
    expect(state.deliver).not.toHaveBeenCalled();
  });

  it('an order sent in to pay in cash shows its photos and records the cash', async () => {
    state.recordCash.mockReset().mockResolvedValue({ paymentId: 'pay1' });
    state.orders = [{ ...paidOrder, status: 'awaiting_payment', paid_at: null, pay_by_cash: true, job_payment_request_id: 'r1' }];
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByText('The client will pay in cash.')).toBeTruthy();
    expect(screen.getByText('IMG_0002.jpg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record cash payment' }));
    await waitFor(() => expect(state.recordCash).toHaveBeenCalledWith('r1', 'cash'));
  });

  it('uploads picked photos as previews, keeps file names, and says which could not be read', async () => {
    state.shop = shop({ provider: 'upload' });
    const { container } = renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByRole('button', { name: 'Add photos' })).toBeTruthy();
    expect(screen.getByText(/your originals stay on your computer/)).toBeTruthy();
    expect(screen.queryByText('Not chosen yet')).toBeNull();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['a'], 'IMG_0423.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'IMG_0424.heic', { type: 'image/heic' }),
    ];
    state.photos = [{ id: 'p1', file_name: 'IMG_0423.jpg', storage_path: 't1/e1/x.jpg', url: 'https://signed/p1' }];
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(screen.getByText(/1 photo added/)).toBeTruthy());
    expect(state.upload).toHaveBeenCalledTimes(1);
    const [tenantId, engagementId, previews] = state.upload.mock.calls[0];
    expect([tenantId, engagementId]).toEqual(['t1', 'e1']);
    expect((previews as { fileName: string }[]).map((p) => p.fileName)).toEqual(['IMG_0423.jpg']);
    expect(screen.getByText(/IMG_0424\.heic/)).toBeTruthy();
    expect(await screen.findByAltText('IMG_0423.jpg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove IMG_0423.jpg' }));
    await waitFor(() => expect(state.deletePhoto).toHaveBeenCalledWith('p1'));
  });

  it('without SmugMug connected: uploads, with a hint to connect SmugMug', async () => {
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByRole('button', { name: 'Add photos' })).toBeTruthy();
    expect(screen.getByText(/Connect it in Photo shop > SmugMug/)).toBeTruthy();
    expect(state.listAlbums).not.toHaveBeenCalled();
  });

  it('with SmugMug connected: prefills the gallery named like the shoot and checks it', async () => {
    state.smugmugConnected = true;
    state.checkGallery.mockResolvedValue({
      passed: true,
      albumName: 'Cohen family',
      photoCount: 40,
      items: [
        { code: 'watermark', ok: true, value: 'true' },
        { code: 'largest_size', ok: true, value: 'Large' },
        { code: 'downloads', ok: true, value: 'false' },
        { code: 'photos', ok: true, value: '40' },
        { code: 'preview_public', ok: true },
        { code: 'original_hidden', ok: true },
      ],
    });
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    const select = (await screen.findByLabelText('SmugMug gallery')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('a2'));
    expect(screen.getByRole('radio', { name: 'In a SmugMug gallery' })).toHaveProperty('checked', true);
    expect(screen.queryByRole('button', { name: 'Add photos' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check gallery' }));
    await waitFor(() => expect(state.checkGallery).toHaveBeenCalledWith('e1', 'a2'));
    expect(await screen.findByText('Watermark on')).toBeTruthy();
    expect(screen.getByText('40 photos read')).toBeTruthy();
    expect(screen.queryByText(/first live check/)).toBeNull();
  });

  it('protection settings show as ⚠ tips, never as blockers; uploading stays one click away', async () => {
    state.smugmugConnected = true;
    state.checkGallery.mockResolvedValue({
      passed: false,
      albumName: 'Cohen family',
      photoCount: 0,
      items: [
        { code: 'watermark', ok: false, value: 'false' },
        { code: 'largest_size', ok: false, value: 'Original' },
        { code: 'downloads', ok: true, value: 'false' },
        { code: 'photos', ok: false },
        { code: 'preview_public', ok: false },
        { code: 'original_hidden', ok: false },
      ],
    });
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    const select = (await screen.findByLabelText('SmugMug gallery')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check gallery' }));
    await waitFor(() => expect(state.checkGallery).toHaveBeenCalledWith('e1', 'a1'));
    expect(await screen.findByText(/Settings > Photo Protection > Watermark Photos/)).toBeTruthy();
    expect(screen.getByText(/Lines marked ⚠ are only tips/)).toBeTruthy();
    expect(screen.getAllByText('⚠')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: 'Upload them here' }));
    expect(await screen.findByRole('button', { name: 'Add photos' })).toBeTruthy();
  });

  it('links to the client view of this shoot', async () => {
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    const link = await screen.findByRole('link', { name: 'See it as your client' });
    expect(link.getAttribute('href')).toBe('/admin/photo-shop?tab=preview&shoot=e1');
  });

  it('a gallery with only videos says so, in one line', async () => {
    state.smugmugConnected = true;
    state.checkGallery.mockResolvedValue({
      passed: false,
      albumName: 'Slideshow',
      photoCount: 0,
      items: [
        { code: 'watermark', ok: true, value: 'in_photos' },
        { code: 'largest_size', ok: true, value: '5K' },
        { code: 'downloads', ok: false, value: 'true' },
        { code: 'photos', ok: false, value: '1', detail: 'videos_only' },
      ],
    });
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    const select = (await screen.findByLabelText('SmugMug gallery')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check gallery' }));
    expect(await screen.findByText(/This gallery only has videos/)).toBeTruthy();
    expect(screen.getAllByText('✗')).toHaveLength(1);
    expect(screen.queryByText(/Clients couldn't open the watermarked photos/)).toBeNull();
  });

  it('has Hebrew text', async () => {
    await setLanguage('he');
    state.orders = [paidOrder];
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByText('חנות תמונות')).toBeTruthy();
    expect(await screen.findByText('שולם, למסירה')).toBeTruthy();
    expect(screen.getByText('פרטים שמילאנו בשבילך')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'הוספת תמונות' })).toBeTruthy();
  });

  it('has Hebrew text for the SmugMug gallery', async () => {
    await setLanguage('he');
    state.smugmugConnected = true;
    renderInApp(<JobPhotoShopCard engagementId="e1" />);
    expect(await screen.findByLabelText('גלריה ב-SmugMug')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'בדיקת הגלריה' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'להעלות אותן כאן' })).toBeTruthy();
  });
});

describe('photo previews', () => {
  it('shrinks to at most 1200px on the longest edge, never enlarges, and names the studio', async () => {
    const { previewSize, watermarkText } = await vi.importActual<typeof import('@/features/jobs/lib/photoPreview')>(
      '@/features/jobs/lib/photoPreview',
    );
    expect(previewSize(6000, 4000)).toEqual({ width: 1200, height: 800 });
    expect(previewSize(4000, 6000)).toEqual({ width: 800, height: 1200 });
    expect(previewSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(watermarkText('Lens Studio')).toBe('© Lens Studio');
    expect(watermarkText('  ')).toBe('© PREVIEW');
  });
});

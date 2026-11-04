// @vitest-environment jsdom
/**
 * Photo shop → SmugMug in Settings (beta): hidden without the flag; the instructions are
 * open until keys are saved and show the fixed callback URL; Save sends both keys;
 * Test connection reports the result; Disconnect only once connected. EN + HE text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SmugMugSetting } from '@/features/settings/components/SmugMugSetting';
import type { SmugMugStatus } from '@/features/settings/services/smugmugService';
import { SMUGMUG_CALLBACK_URL } from '@/features/settings/services/smugmugService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  flag: true,
  status: { hasKeys: false, connected: false, keysUpdatedAt: null, connectedAt: null } as SmugMugStatus,
  saveKeys: vi.fn(async () => undefined),
  test: vi.fn(async () => 'keys' as const),
  disconnect: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:photo_shop', isLoading: false }),
}));
vi.mock('@/features/settings/services/smugmugService', async (orig) => {
  const real = await orig<typeof import('@/features/settings/services/smugmugService')>();
  return {
    ...real,
    SmugMugService: {
      getStatus: async () => state.status,
      saveKeys: (k: string, s: string) => state.saveKeys(k, s),
      test: () => state.test(),
      start: vi.fn(),
      complete: vi.fn(),
      disconnect: () => state.disconnect(),
    },
  };
});

describe('SmugMug settings', () => {
  beforeEach(async () => {
    state.flag = true;
    state.status = { hasKeys: false, connected: false, keysUpdatedAt: null, connectedAt: null };
    state.saveKeys.mockClear();
    state.disconnect.mockClear();
    setTenant('photographer');
    await setLanguage('en');
  });

  it('is hidden without the photo shop flag', () => {
    state.flag = false;
    const { container } = renderInApp(<SmugMugSetting />);
    expect(container.textContent).not.toContain('SmugMug');
  });

  it('opens the instructions with the fixed callback URL until keys are saved', async () => {
    const { container } = renderInApp(<SmugMugSetting />);
    await waitFor(() => expect(container.querySelector('details')?.open).toBe(true));
    expect(screen.getByText(SMUGMUG_CALLBACK_URL)).toBeTruthy();
    expect(SMUGMUG_CALLBACK_URL).toBe('https://app.opalswift.com/admin/setup/integrations/smugmug/callback');
    expect(screen.getByText('https://api.smugmug.com/api/developer/apply')).toBeTruthy();
    expect(screen.getByText('Connect SmugMug to open your shop.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Connect SmugMug' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves both keys, then tests the connection', async () => {
    renderInApp(<SmugMugSetting />);
    const save = await screen.findByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: ' key ' } });
    fireEvent.change(screen.getByLabelText('API Secret'), { target: { value: 'secret' } });
    fireEvent.click(save);
    await waitFor(() => expect(state.saveKeys).toHaveBeenCalledWith(' key ', 'secret'));

    state.status = { hasKeys: true, connected: false, keysUpdatedAt: '2026-11-04T10:00:00Z', connectedAt: null };
    renderInApp(<SmugMugSetting />);
    const tests = await screen.findAllByRole('button', { name: 'Test connection' });
    await waitFor(() => expect((tests[1] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(tests[1]);
    expect(await screen.findByText('Your API Key and Secret work. Press Connect SmugMug to finish.')).toBeTruthy();
  });

  it('offers Disconnect once connected', async () => {
    state.status = { hasKeys: true, connected: true, keysUpdatedAt: '2026-11-04T10:00:00Z', connectedAt: '2026-11-04T11:00:00Z' };
    const { container } = renderInApp(<SmugMugSetting />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(state.disconnect).toHaveBeenCalled());
    expect(container.querySelector('details')?.open).toBe(false);
  });

  it('has Hebrew text', async () => {
    await setLanguage('he');
    renderInApp(<SmugMugSetting />);
    expect(await screen.findByText('איך מקבלים מפתח API של SmugMug')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'חיבור SmugMug' })).toBeTruthy();
  });
});

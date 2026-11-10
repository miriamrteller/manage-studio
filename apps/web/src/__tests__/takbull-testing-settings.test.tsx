// @vitest-environment jsdom
/**
 * Takbull keys in Settings -> Payments (testing only): hidden without the beta switch and on the
 * live site; Save
 * sends both keys to save_tenant_takbull_credentials; Test connection calls
 * verify-takbull-credentials and reports the result. The provider is never changed.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { FEATURES, PROFILE_GATES } from '@shared/index';

const h = vi.hoisted(() => ({
  flag: true,
  devSite: true,
  savedAt: null as string | null,
  saved: false,
  statusFails: false,
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', payment_provider: 'offline' }) }));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => h.flag && k === 'billing:takbull_testing', isLoading: false }),
}));
vi.mock('@/lib/devStudioPicker', () => ({ isDevSite: () => h.devSite }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    functions: { invoke: h.invoke },
  },
}));

/** Status calls answer from h; every other call (Test connection) gets `answer`. */
function testAnswer(answer: Record<string, unknown>) {
  h.invoke.mockImplementation(async (_name: string, opts?: { body?: { action?: string } }) => {
    if (opts?.body?.action === 'status') {
      if (h.statusFails) return { data: null, error: new Error('unreachable') };
      return { data: { ok: true, saved: h.saved, saved_at: h.savedAt }, error: null };
    }
    return { data: answer, error: null };
  });
}

import i18n from '@/i18n/i18n';
import { TakbullTestingForm } from '@/features/settings/components/TakbullTestingForm';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TakbullTestingForm />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  h.flag = true;
  h.devSite = true;
  h.savedAt = null;
  h.saved = false;
  h.statusFails = false;
  h.rpc.mockReset().mockResolvedValue({ error: null });
  h.invoke.mockReset();
  testAnswer({ ok: true, valid: true });
  await i18n.changeLanguage('en');
});
afterEach(() => cleanup());

describe('Takbull keys (testing only)', () => {
  it('is an opt-in beta switch, off unless switched on for a studio', () => {
    expect(FEATURES.billing.takbullTesting).toBe('billing:takbull_testing');
    expect(PROFILE_GATES[FEATURES.billing.takbullTesting]).toBe('opt_in');
  });

  it('shows nothing without the switch', () => {
    h.flag = false;
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });

  it('never shows on the live site, even with the switch on', () => {
    h.devSite = false;
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });

  it('saves both keys, trimmed, and nothing else', async () => {
    renderIt();
    expect(await screen.findByText('No Takbull keys saved yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: ' key-1 ' } });
    fireEvent.change(screen.getByLabelText('API secret'), { target: { value: ' secret-1 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Takbull keys' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('save_tenant_takbull_credentials', { p_api_key: 'key-1', p_api_secret: 'secret-1' }),
    );
    expect((await screen.findAllByText('Takbull keys saved.')).length).toBeGreaterThan(0);
  });

  it('Test connection works right after saving, even if the saved date cannot be read', async () => {
    renderIt();
    fireEvent.change(await screen.findByLabelText('API key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('API secret'), { target: { value: 's' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Takbull keys' }));
    await screen.findAllByText('Takbull keys saved.');
    const test = screen.getByRole('button', { name: 'Test connection' });
    expect(test).not.toBeDisabled();
    fireEvent.click(test);
    expect(await screen.findByText('Takbull accepted the keys.')).toBeInTheDocument();
  });

  it('Test connection with no keys saved says so', async () => {
    testAnswer({ ok: false, valid: false, code: 'not_connected' });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No Takbull keys saved yet.');
  });

  it('says the keys are saved, with the date, when the server says so', async () => {
    h.saved = true;
    h.savedAt = '2026-11-08T10:00:00Z';
    renderIt();
    expect(await screen.findByText(/Takbull keys saved .*2026/)).toBeInTheDocument();
    expect(screen.queryByText('No Takbull keys saved yet.')).not.toBeInTheDocument();
  });

  it('never says "no keys" when it cannot tell', async () => {
    h.statusFails = true;
    renderIt();
    await screen.findByRole('button', { name: 'Test connection' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('No Takbull keys saved yet.')).not.toBeInTheDocument();
  });

  it('a Test connection that reached Takbull shows the keys as saved, even when Takbull refuses', async () => {
    h.statusFails = true;
    testAnswer({ ok: false, valid: false, message: 'Could not resolve merchant' });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not resolve merchant');
    expect(screen.getByText('Takbull keys saved.')).toBeInTheDocument();
  });

  it('Test connection reports what Takbull said', async () => {
    h.saved = true;
    h.savedAt = '2026-11-08T10:00:00Z';
    renderIt();
    const test = await screen.findByRole('button', { name: 'Test connection' });
    await waitFor(() => expect(test).not.toBeDisabled());
    fireEvent.click(test);
    expect(await screen.findByText('Takbull accepted the keys.')).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('verify-takbull-credentials');
  });

  it('has Hebrew text', async () => {
    await i18n.changeLanguage('he');
    renderIt();
    expect(await screen.findByText('תקבול (בדיקות)')).toBeInTheDocument();
  });
});

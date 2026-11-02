// @vitest-environment jsdom
/**
 * YPay in Settings -> Payment: its own labelled fields, Test connection, and the explicit
 * "which document does YPay issue" choice (never inferred from business status).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  rpc: vi.fn(),
  invoke: vi.fn(),
  update: vi.fn(),
  docType: 109,
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => h.tenant }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    functions: { invoke: h.invoke },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ypay_document_type: h.docType }, error: null }) }) }),
      update: (values: unknown) => ({
        eq: async () => {
          h.update(values);
          return { error: null };
        },
      }),
    }),
  },
}));

import i18n from '@/i18n/i18n';
import { PaymentSettingsForm } from '@/features/settings/components/PaymentSettingsForm';
import { isEncryptionKeyMissing } from '@/features/settings/components/YpaySettingsForm';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PaymentSettingsForm />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.tenant = { id: 't1', payment_provider: 'ypay', invoicing_provider: 'ypay', payment_provider_secret_configured: true };
  h.docType = 109;
  h.rpc.mockResolvedValue({ error: null });
});

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('YPay settings', () => {
  it('shows YPay-named fields, no webhook box and no Stripe labels', () => {
    renderIt();
    expect(screen.getByLabelText('YPay client ID')).toBeInTheDocument();
    expect(screen.getByLabelText('YPay client secret')).toBeInTheDocument();
    expect(screen.queryByLabelText('Webhook secret')).toBeNull();
    expect(screen.queryByLabelText('Publishable key')).toBeNull();
    expect(screen.getByText(/Find your client ID and client secret in your YPay account/)).toBeInTheDocument();
  });

  it('saves with the YPay credentials RPC', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('YPay client ID'), { target: { value: ' cid ' } });
    fireEvent.change(screen.getByLabelText('YPay client secret'), { target: { value: 'sec' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save YPay details' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('save_tenant_ypay_credentials', { p_client_id: 'cid', p_client_secret: 'sec' }),
    );
  });

  it('Test connection says Connected ✓', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, valid: true, message: 'YPay credentials accepted.' }, error: null });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/Connected ✓/)).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('verify-ypay-credentials');
  });

  it('Test connection shows the real reason when it fails', async () => {
    h.invoke.mockResolvedValue({ data: { ok: false, valid: false, message: 'YPay rejected the client secret' }, error: null });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('YPay rejected the client secret');
  });

  it('a missing platform encryption key is said plainly, not as a generic error', async () => {
    h.rpc.mockResolvedValue({ error: new Error('app.encryption_key is not configured') });
    renderIt();
    fireEvent.change(screen.getByLabelText('YPay client ID'), { target: { value: 'cid' } });
    fireEvent.change(screen.getByLabelText('YPay client secret'), { target: { value: 'sec' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save YPay details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Online payments can't be saved yet: the platform's encryption key isn't set up",
    );
    expect(isEncryptionKeyMissing('app.encryption_key is not configured')).toBe(true);
    expect(isEncryptionKeyMissing('rejected')).toBe(false);
  });

  it('Test connection is off until keys are saved', () => {
    h.tenant = { ...h.tenant, payment_provider_secret_configured: false };
    renderIt();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
  });

  it('the document choice defaults to the invoice-receipt and saves 108 or 109 explicitly', async () => {
    renderIt();
    const select = await screen.findByLabelText('Document type');
    await waitFor(() => expect(select).toHaveValue('109'));
    expect(screen.getByText('Choose what your YPay account issues. Ask YPay if unsure.')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '108' } });
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ ypay_document_type: 108 }));
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    renderIt();
    expect(screen.getByLabelText('מזהה לקוח ב-YPay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'בדיקת חיבור' })).toBeInTheDocument();
  });
});

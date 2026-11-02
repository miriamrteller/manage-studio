// @vitest-environment jsdom
/**
 * G7: the Grow settings form renders, gates save until all fields are filled, and saves via the
 * save_tenant_grow_credentials RPC. P1 #1: the first save also makes the webhook key Grow must
 * send with every payment notice, and the form shows the notice URL and the key (once).
 * Run: pnpm -C apps/web test GrowSettingsForm.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GrowSettingsForm } from '../features/settings/components/GrowSettingsForm';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ payment_provider: 'grow', payment_provider_secret_configured: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

const NEW_KEY = 'f'.repeat(64);

/** Route each RPC by name; `configured` = whether a webhook key already exists. */
function mockRpc({ configured }: { configured: boolean }) {
  rpc.mockImplementation(async (name: string) => {
    if (name === 'get_grow_webhook_key_status') {
      return { data: [{ configured, key_version: configured ? 1 : null, created_at: null }], error: null };
    }
    if (name === 'rotate_grow_webhook_key') return { data: NEW_KEY, error: null };
    return { data: null, error: null };
  });
}

function fillAndSave() {
  fireEvent.change(screen.getByLabelText('Grow user ID'), { target: { value: 'user-1' } });
  fireEvent.change(screen.getByLabelText('Page code'), { target: { value: 'page-1' } });
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'key-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GrowSettingsForm />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  invoke.mockReset();
});

describe('GrowSettingsForm', () => {
  it('renders the credential fields', () => {
    renderForm();
    expect(screen.getByLabelText('Grow user ID')).toBeTruthy();
    expect(screen.getByLabelText('Page code')).toBeTruthy();
    expect(screen.getByLabelText('API key')).toBeTruthy();
  });

  it('disables save until every field is filled', () => {
    renderForm();
    const save = screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('saves via save_tenant_grow_credentials when all fields are provided', async () => {
    mockRpc({ configured: true });
    renderForm();

    fireEvent.change(screen.getByLabelText('Grow user ID'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Page code'), { target: { value: 'page-1' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'key-1' } });

    const save = screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('save_tenant_grow_credentials', {
        p_user_id: 'user-1',
        p_page_code: 'page-1',
        p_api_key: 'key-1',
      }),
    );
  });

  it('makes a webhook key on the first save and shows it with the notice URL', async () => {
    mockRpc({ configured: false });
    renderForm();
    fillAndSave();

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('rotate_grow_webhook_key'));
    const keyField = (await screen.findByLabelText('Webhook key')) as HTMLInputElement;
    expect(keyField.value).toBe(NEW_KEY);
    expect(keyField.readOnly).toBe(true);
    const urlField = screen.getByLabelText('Notification address (URL)') as HTMLInputElement;
    expect(urlField.value).toMatch(/\/functions\/v1\/handle-payment-event$/);
    expect(screen.getByText(/shown only once/)).toBeTruthy();
  });

  it('does not replace an existing key when credentials are saved again', async () => {
    mockRpc({ configured: true });
    renderForm();
    fillAndSave();

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_tenant_grow_credentials', expect.anything()));
    await waitFor(() => expect(screen.getByText('Grow credentials saved.')).toBeTruthy());
    expect(rpc).not.toHaveBeenCalledWith('rotate_grow_webhook_key');
    expect(screen.queryByLabelText('Webhook key')).toBeNull();
    expect(screen.getByText(/A webhook key is set/)).toBeTruthy();
  });

  it('can make a new key on request', async () => {
    mockRpc({ configured: true });
    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Make a new webhook key' }));

    const keyField = (await screen.findByLabelText('Webhook key')) as HTMLInputElement;
    expect(keyField.value).toBe(NEW_KEY);
  });

  it('warns when no key exists yet', async () => {
    mockRpc({ configured: false });
    renderForm();
    expect(await screen.findByText(/No webhook key yet/)).toBeTruthy();
  });
});

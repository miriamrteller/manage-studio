// @vitest-environment jsdom
/**
 * I3-T6 — FinanceHealthCard dispatches verify by provider slug.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinanceHealthCard } from '@/features/finance/components/FinanceHealthCard';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

function renderCard(provider: 'grow' | 'icount' | 'invoice4u') {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FinanceHealthCard provider={provider} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

describe('FinanceHealthCard provider routing (I3-T6)', () => {
  it('calls verify-grow-credentials for grow provider', async () => {
    invoke.mockResolvedValue({ data: { valid: true }, error: null });
    renderCard('grow');
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('verify-grow-credentials', { body: {} }),
    );
    expect(invoke).not.toHaveBeenCalledWith('verify-icount-credentials', expect.anything());
  });

  it('calls verify-icount-credentials for icount provider', async () => {
    invoke.mockResolvedValue({ data: { valid: true }, error: null });
    renderCard('icount');
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('verify-icount-credentials', { body: {} }),
    );
    expect(invoke).not.toHaveBeenCalledWith('verify-grow-credentials', expect.anything());
  });

  it('calls verify-invoice4u-credentials for invoice4u provider', async () => {
    invoke.mockResolvedValue({ data: { valid: true }, error: null });
    renderCard('invoice4u');
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('verify-invoice4u-credentials', { body: {} }),
    );
    expect(invoke).not.toHaveBeenCalledWith('verify-grow-credentials', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('verify-icount-credentials', expect.anything());
  });
});

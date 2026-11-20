import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DeleteClientDialog } from '@/features/people/components/DeleteClientDialog';
import { PersonService } from '@/features/people/service';
import { renderInApp, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const clear = { can_delete: true, deleted: false, blockers: [], people: 1, shoots: 2 };
const kept = { can_delete: false, deleted: false, blockers: ['payments'], people: 1, shoots: 1 };

function renderDialog(onDeleted = vi.fn()) {
  renderInApp(
    <DeleteClientDialog open onOpenChange={() => {}} personId="p-1" personName="Test Client" onDeleted={onDeleted} />,
    { path: '/' },
  );
  return onDeleted;
}

describe('Delete client', () => {
  beforeEach(() => {
    setTenant('photographer');
    vi.restoreAllMocks();
  });

  it('checks first, then deletes for good on confirm', async () => {
    const spy = vi
      .spyOn(PersonService, 'deleteClient')
      .mockResolvedValueOnce(clear)
      .mockResolvedValueOnce({ ...clear, deleted: true });
    const onDeleted = renderDialog();
    expect(await screen.findByText("This can't be undone.")).toBeInTheDocument();
    expect(screen.getByText('Their shoots and bookings are deleted too.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('p-1', false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(spy).toHaveBeenLastCalledWith('p-1', true);
  });

  it('keeps a client with payments and offers Set to Inactive instead', async () => {
    const spy = vi.spyOn(PersonService, 'deleteClient').mockResolvedValue(kept);
    const update = vi.spyOn(PersonService, 'update').mockResolvedValue({} as never);
    renderDialog();
    expect(await screen.findByText(/so the record is kept/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete for good' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set to Inactive' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.anything(), 'p-1', { status: 'inactive' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

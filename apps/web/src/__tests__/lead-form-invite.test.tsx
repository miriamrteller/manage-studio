// @vitest-environment jsdom
/**
 * An admin's "Send form" link (#invite=<token>) prefills the enquiry form with
 * the name and email the admin typed; the token leaves the address bar; the
 * enquiry is linked to the invite; a wrong token just leaves the form blank.
 * Run: pnpm -C apps/web test lead-form-invite.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { outcome: 'created' }, error: null as unknown })),
  rpc: vi.fn<[string, unknown?], Promise<{ data: unknown; error: unknown }>>(async () => ({ data: null, error: null })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: h.invoke },
    rpc: h.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { lead_form: { presets: {}, custom: [] } }, error: null }) }) }),
    }),
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet', vertical: 'dance-studio' }),
}));
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 'creativeballet' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }) }));

import { InquiryForm } from '@/features/crm/components/InquiryForm';
import { supabase } from '@/lib/supabase';
import { readInviteToken } from '@/features/crm/hooks/useLeadFormInvite';

const TOKEN = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCD';

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <InquiryForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockImplementation(async () => ({ data: null, error: null }));
  // Spy on the client the form actually uses (modules can be shared across test files).
  vi.spyOn(supabase, 'rpc').mockImplementation(((fn: string, args?: unknown) => h.rpc(fn, args)) as never);
  vi.spyOn(supabase.functions, 'invoke').mockImplementation(((...a: unknown[]) => (h.invoke as (...x: unknown[]) => unknown)(...a)) as never);
  window.history.replaceState(null, '', `/inquire?src=direct#invite=${TOKEN}`);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Send-form invite links', () => {
  it('reads only a well-formed token from the fragment', () => {
    expect(readInviteToken(`#invite=${TOKEN}`)).toBe(TOKEN);
    expect(readInviteToken('#invite=short')).toBeNull();
    expect(readInviteToken('#other=1')).toBeNull();
    expect(readInviteToken('')).toBeNull();
  });

  it('prefills the name and email (editable), drops the token from the URL, and links the enquiry', async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_lead_form_invite' ? { data: { name: 'Noa', email: 'noa@example.test' }, error: null } : { data: null, error: null },
    );
    renderForm();
    await waitFor(() => expect(document.getElementById('inquire-name')).toHaveValue('Noa'));
    expect(document.getElementById('inquire-email')).toHaveValue('noa@example.test');
    expect(h.rpc).toHaveBeenCalledWith('get_lead_form_invite', { p_tenant_id: 't-1', p_token: TOKEN });
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?src=direct');

    fireEvent.change(document.getElementById('inquire-name')!, { target: { value: 'Noa Levi' } });
    expect(document.getElementById('inquire-name')).toHaveValue('Noa Levi');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(h.invoke).toHaveBeenCalled());
    const body = (h.invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(body.invite).toBe(TOKEN);
    expect(body.name).toBe('Noa Levi');
  });

  it('a wrong or expired token leaves the form blank, with no error', async () => {
    renderForm();
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('get_lead_form_invite', expect.anything()));
    expect(document.getElementById('inquire-name')).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no token: nothing is looked up', () => {
    window.history.replaceState(null, '', '/inquire');
    renderForm();
    expect(h.rpc).not.toHaveBeenCalledWith('get_lead_form_invite', expect.anything());
  });
});

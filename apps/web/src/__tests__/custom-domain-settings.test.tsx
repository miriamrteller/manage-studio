// @vitest-environment jsdom
/**
 * Settings → Custom domain: prefill, the records to add, Check now, paused and
 * connected states, type-to-confirm removal, OpalSwift-managed domains, and the
 * card staying hidden outside the rollout.
 * Run: pnpm -C apps/web test custom-domain-settings.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomDomainSettings, type CustomDomainView } from '../features/settings/components/CustomDomainSettings';
import { problemKey, suggestCustomDomain } from '../features/settings/lib/customDomain';

const { invoke, rpc, tenantState } = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  tenantState: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, string>) => (o ? `${k} ${Object.values(o).join(' ')}` : k),
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  invoke.mockReset();
  rpc.mockReset();
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const pending: CustomDomainView = {
  id: 'd1', hostname: 'app.harbour-yoga.com', status: 'pending', managed_by: 'self_serve', ssl_status: 'pending_validation',
  dns_records: [
    { type: 'CNAME', name: 'app.harbour-yoga.com', value: 'proxy-fallback.opalswift.com', purpose: 'route' },
    { type: 'TXT', name: '_cf-custom-hostname.app.harbour-yoga.com', value: 'own-token', purpose: 'ownership' },
  ],
  error_code: 'dns_not_ready', auto_check_until: '2026-11-04T10:00:00Z', last_checked_at: null, activated_at: null,
  delete_after: '2026-12-03T10:00:00Z',
};

function respond(byAction: Record<string, unknown>) {
  invoke.mockImplementation((_name: string, opts: { body: { action: string } }) =>
    Promise.resolve({ data: byAction[opts.body.action] ?? { domain: null }, error: null }));
}

describe('suggestCustomDomain', () => {
  it('uses the studio\'s own domain from legal links or its contact email, never free mail or ours', () => {
    expect(suggestCustomDomain({ contact_email: 'info@creativeballetacademy.com' })).toBe('app.creativeballetacademy.com');
    expect(suggestCustomDomain({ privacy_policy_url: 'https://www.studio.co.il/privacy', contact_email: 'x@gmail.com' })).toBe('app.studio.co.il');
    expect(suggestCustomDomain({ contact_email: 'studio@gmail.com' })).toBe('');
    expect(suggestCustomDomain({ terms_url: 'https://studio.opalswift.com/terms' })).toBe('');
    expect(suggestCustomDomain(null)).toBe('');
  });
  it('maps unknown codes to a generic message', () => {
    expect(problemKey('caa_blocked')).toBe('settings.custom_domain.codes.caa_blocked');
    expect(problemKey('something_new')).toBe('settings.custom_domain.codes.unknown');
    expect(problemKey(null)).toBeNull();
  });
});

describe('CustomDomainSettings', () => {
  it('stays hidden outside the rollout', async () => {
    rpc.mockResolvedValue({ data: false });
    wrap(<CustomDomainSettings />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByText('settings.custom_domain.title')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('prefills the address from the studio email and connects it', async () => {
    rpc.mockResolvedValue({ data: true });
    Object.assign(tenantState, { contact_email: 'hello@harbour-yoga.com' });
    respond({ status: { enabled: true, domain: null }, request: { domain: pending } });
    wrap(<CustomDomainSettings />);
    const input = await screen.findByLabelText('settings.custom_domain.input_label');
    expect(input).toHaveValue('app.harbour-yoga.com');
    fireEvent.click(screen.getByRole('button', { name: 'settings.custom_domain.connect' }));
    expect(await screen.findByText('proxy-fallback.opalswift.com')).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith('custom-domain', { body: { action: 'request', hostname: 'app.harbour-yoga.com' } });
    expect(screen.getByText('settings.custom_domain.codes.dns_not_ready')).toBeTruthy();
    expect(screen.getByLabelText('settings.custom_domain.provider_label')).toBeTruthy();
  });

  it('a refused address is explained in plain words', async () => {
    rpc.mockResolvedValue({ data: true });
    respond({ status: { domain: null }, request: { error: 'invalid_hostname', code: 'apex' } });
    wrap(<CustomDomainSettings />);
    const input = await screen.findByLabelText('settings.custom_domain.input_label');
    fireEvent.change(input, { target: { value: 'harbour-yoga.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.custom_domain.connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('settings.custom_domain.codes.apex');
  });

  it('paused: says so, and Check now works', async () => {
    rpc.mockResolvedValue({ data: true });
    respond({ status: { domain: { ...pending, status: 'paused' } }, check: { domain: { ...pending, status: 'active', activated_at: '2026-11-03T12:00:00Z', error_code: null } } });
    wrap(<CustomDomainSettings />);
    expect(await screen.findByText(/settings.custom_domain.status_paused/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'settings.custom_domain.check_now' }));
    expect(await screen.findByText(/settings.custom_domain.status_active/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'settings.custom_domain.check_now' })).toBeNull();
  });

  it('removal needs the address typed exactly', async () => {
    rpc.mockResolvedValue({ data: true });
    respond({ status: { domain: { ...pending, status: 'active' } }, remove: { domain: { ...pending, status: 'removed' } } });
    wrap(<CustomDomainSettings />);
    const remove = await screen.findByRole('button', { name: 'settings.custom_domain.remove' });
    expect(remove).toBeDisabled();
    const box = screen.getByLabelText(/settings.custom_domain.remove_label/);
    fireEvent.change(box, { target: { value: 'app.wrong.com' } });
    expect(remove).toBeDisabled();
    fireEvent.change(box, { target: { value: ' APP.harbour-yoga.com ' } });
    expect(remove).not.toBeDisabled();
    fireEvent.click(remove);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('custom-domain', { body: { action: 'remove', confirmHostname: ' APP.harbour-yoga.com ' } }));
    expect(await screen.findByLabelText('settings.custom_domain.input_label')).toBeTruthy();
  });

  it('a domain OpalSwift connects is read-only: no records, no Check now, no Remove', async () => {
    rpc.mockResolvedValue({ data: true });
    respond({ status: { domain: { ...pending, managed_by: 'opalswift', dns_records: [], error_code: 'opalswift_connects' } } });
    wrap(<CustomDomainSettings />);
    expect(await screen.findByText(/settings.custom_domain.managed_pending/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'settings.custom_domain.check_now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'settings.custom_domain.remove' })).toBeNull();
  });
});

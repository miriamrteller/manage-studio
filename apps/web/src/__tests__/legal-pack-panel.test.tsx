// @vitest-environment jsdom
/**
 * The legal pack panel (end of onboarding, Settings → Legal): drafts notice,
 * the PDF, and the required acknowledgement that publishes the studio's legal
 * pages and seeds its signed template.
 * Run: pnpm -C apps/web test legal-pack-panel.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  acknowledgedAt: null as string | null,
  profile: null as Record<string, string> | null,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';
import { fieldsForVertical } from '@/legal/fields';

/** Every required detail a dance studio fills in. */
const FULL_PROFILE: Record<string, string> = Object.fromEntries(
  fieldsForVertical('dance-studio').filter((f) => f.required).map((f) => [f.key, 'filled']),
);

function profileRow() {
  return {
    tenant_id: 't-1',
    name: 'Harbour Dance',
    contact_email: 'office@harbour.test',
    skin: 'dance-studio',
    legal_profile: h.profile ?? FULL_PROFILE,
    legal_pages_published: false,
    legal_profile_updated_at: null,
    legal_pack_required: true,
    legal_pack_acknowledged_at: h.acknowledgedAt,
    language_default: 'en',
  };
}

function renderPanel(mode: 'acknowledge' | 'notice', detailsHref?: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <LegalPackPanel tenantId="t-1" mode={mode} detailsHref={detailsHref} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.acknowledgedAt = null;
  h.profile = null;
  h.invoke.mockResolvedValue({ data: { seeded: 0 }, error: null });
  h.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_tenant_legal_profile') return { data: [profileRow()], error: null };
    if (name === 'acknowledge_studio_legal_pack') {
      h.acknowledgedAt = '2026-11-02T12:00:00Z';
      return { data: h.acknowledgedAt, error: null };
    }
    return { data: null, error: null };
  });
});
afterEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('legal pack panel', () => {
  it('shows the drafts notice and the PDF for this studio', async () => {
    renderPanel('acknowledge');
    expect(screen.getByRole('note')).toHaveTextContent('have them reviewed by a lawyer');
    expect(screen.getByRole('link', { name: 'Download legal pack (PDF)' })).toHaveAttribute(
      'href',
      '/legal-pack/print?tenant=t-1',
    );
  });

  it('confirming needs the checkbox, makes sure the health declaration exists, and stores the version', async () => {
    renderPanel('acknowledge');
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand these are draft documents/ }));
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('acknowledge_studio_legal_pack', {
        p_version: expect.stringMatching(/^[0-9a-f]{8}-/),
        p_language: 'en',
      }),
    );
    expect(h.invoke).toHaveBeenCalledWith('provision-studio', { body: { action: 'ensure_signed_template' } });
    expect(await screen.findByRole('status')).toHaveTextContent('Confirmed on');
  });

  it('a studio without its form is told so in plain words', async () => {
    h.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_tenant_legal_profile') return { data: [profileRow()], error: null };
      return { data: null, error: { message: 'signed_template_missing' } };
    });
    renderPanel('acknowledge');
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your health declaration is missing');
  });

  it('cannot confirm while required details are empty, and says which and where', async () => {
    h.profile = { legal_name: 'Harbour Dance Ltd', address: '1 Harbour St' };
    renderPanel('acknowledge', '#legal-details');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByText(/details missing\. Fill them in before you confirm\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fill in the missing details' })).toHaveAttribute('href', '#legal-details');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('business status is not a required detail', async () => {
    h.profile = { ...FULL_PROFILE };
    delete h.profile.business_status;
    renderPanel('acknowledge');
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled());
    expect(screen.queryByText(/details? missing/)).toBeNull();
  });

  it('after setting a studio up, the platform owner sees the notice but cannot confirm for the studio', async () => {
    renderPanel('notice');
    expect(await screen.findByText(/The studio's owner confirms this when they sign in/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderPanel('acknowledge');
    expect(screen.getByRole('link', { name: 'הורדת חבילת המסמכים (PDF)' })).toBeInTheDocument();
  });
});

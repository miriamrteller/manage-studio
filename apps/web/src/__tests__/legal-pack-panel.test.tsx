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

const h = vi.hoisted(() => ({ rpc: vi.fn(), acknowledgedAt: null as string | null }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc } }));

import i18n from '@/i18n/i18n';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';

function profileRow() {
  return {
    tenant_id: 't-1',
    name: 'Harbour Dance',
    contact_email: 'office@harbour.test',
    skin: 'dance-studio',
    legal_profile: { legal_name: 'Harbour Dance Ltd' },
    legal_pages_published: false,
    legal_profile_updated_at: null,
    legal_pack_required: true,
    legal_pack_acknowledged_at: h.acknowledgedAt,
    language_default: 'en',
  };
}

function renderPanel(mode: 'acknowledge' | 'notice') {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <LegalPackPanel tenantId="t-1" mode={mode} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.acknowledgedAt = null;
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

  it('confirming needs the checkbox, stores the version and seeds the health declaration', async () => {
    renderPanel('acknowledge');
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand these are draft documents/ }));
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('acknowledge_studio_legal_pack', expect.objectContaining({
        p_language: 'en',
        p_template_name: 'Health declaration',
      })),
    );
    const args = h.rpc.mock.calls.find(([n]) => n === 'acknowledge_studio_legal_pack')![1];
    expect(args.p_version).toMatch(/^[0-9a-f]{8}-/);
    expect(args.p_template_content).toContain('Harbour Dance');
    expect(await screen.findByRole('status')).toHaveTextContent('Confirmed on');
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

// @vitest-environment jsdom
/**
 * The public enquiry form ends with a small "Powered by OpalSwift" link to the
 * marketing site, opening in a new tab.
 * Run: pnpm -C apps/web test inquiry-powered-by.test.tsx
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ teaches: true, vertical: 'dance-studio' }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { lead_form: { presets: {}, custom: [] } }, error: null }) }) }) }),
  },
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Studio', subdomain: 's', vertical: h.vertical, profile: { teachesClasses: h.teaches } }),
}));
vi.mock('@/hooks/useSignedInPrefill', () => ({ useSignedInPrefill: () => ({}), useFillWhenEmpty: () => {} }));
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 's' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));

import i18n from '@/i18n/i18n';
import { InquiryForm } from '@/features/crm/components/InquiryForm';

function renderForm() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <InquiryForm />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('Powered by OpalSwift', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('links to opalswift.com in a new tab', () => {
    renderForm();
    const link = screen.getByRole('link', { name: /Powered by OpalSwift/ });
    expect(link.getAttribute('href')).toBe('https://opalswift.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('(opens in a new tab)');
  });

  it('reads naturally in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderForm();
    expect(screen.getByRole('link', { name: /מופעל על ידי OpalSwift/ })).toBeTruthy();
  });
});

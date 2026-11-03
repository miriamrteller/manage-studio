// @vitest-environment jsdom
/**
 * The enquiry form's message example is general; the class example shows only
 * to studios that teach classes.
 * Run: pnpm -C apps/web test inquiry-placeholder.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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

const placeholder = () => document.getElementById('inquire-message')!.getAttribute('placeholder');

describe('enquiry message example', () => {
  it('a studio that teaches classes sees the class example', () => {
    h.teaches = true;
    h.vertical = 'dance-studio';
    renderForm();
    expect(placeholder()).toBe("e.g. a trial class for my daughter, or what you're looking for and when");
  });

  it('everyone else sees a general one', () => {
    h.teaches = false;
    h.vertical = 'generic';
    renderForm();
    expect(placeholder()).toBe("e.g. what you're looking for and when");
    expect(placeholder()).not.toMatch(/class|daughter/);
  });

  it('photographers never see the class example', () => {
    h.teaches = true;
    h.vertical = 'photographer';
    renderForm();
    expect(placeholder()).toBe("e.g. what you're looking for and when");
  });

  it('in Hebrew', async () => {
    await i18n.changeLanguage('he');
    h.teaches = false;
    h.vertical = 'generic';
    renderForm();
    expect(placeholder()).toBe('למשל מה אתם מחפשים ומתי');
    await i18n.changeLanguage('en');
  });
});

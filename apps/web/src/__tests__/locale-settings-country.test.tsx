// @vitest-environment jsdom
/**
 * Settings → Language & Region: no country row; only the main language is a
 * choice, and saving leaves the studio's stored country as it is.
 * Run: pnpm -C apps/web test locale-settings-country.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  row: { language_default: 'en', country: 'IL', currency: 'ILS', phone_region: 'IL' } as Record<string, string>,
  update: vi.fn(),
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1' }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = (_c: string, opts?: { head?: boolean }) => {
        if (opts?.head) return { eq: async () => ({ count: 0, error: null }) };
        return q;
      };
      q.eq = () => q;
      q.single = async () => ({ data: table === 'tenants' ? h.row : null, error: null });
      q.update = (values: unknown) => {
        h.update(values);
        return { eq: async () => ({ error: null }) };
      };
      return q;
    },
  },
}));

import i18n from '@/i18n/i18n';
import queryClient from '@/lib/query-client';
import { LocaleSettingsForm } from '@/features/settings/components/LocaleSettingsForm';

function renderForm() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <LocaleSettingsForm />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  h.row = { language_default: 'en', country: 'IL', currency: 'ILS', phone_region: 'IL' };
});
afterEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('country in Settings → Language & Region', () => {
  it('has no country row; saving changes the language and leaves the country alone', async () => {
    renderForm();
    await waitFor(() => expect(queryClient.getQueryData(['tenant-locale', 't-1'])).toBeTruthy());
    expect(screen.queryByText('Country')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Country' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Default language'), { target: { value: 'he' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ language_default: 'he' })));
    expect(h.update.mock.calls[0][0]).not.toHaveProperty('country');
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderForm();
    await waitFor(() => expect(queryClient.getQueryData(['tenant-locale', 't-1'])).toBeTruthy());
    expect(screen.queryByText('מדינה')).toBeNull();
  });
});

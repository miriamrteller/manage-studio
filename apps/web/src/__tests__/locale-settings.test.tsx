// @vitest-environment jsdom
/**
 * Settings → Language & Region: only the main language is a choice. No country,
 * currency or phone region fields; saving writes only language_default.
 * Run: pnpm -C apps/web test locale-settings.test.tsx
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

describe('Settings → Language & Region', () => {
  it('only the main language is a choice; saving writes only it', async () => {
    renderForm();
    await waitFor(() => expect(queryClient.getQueryData(['tenant-locale', 't-1'])).toBeTruthy());
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const label of ['Country', 'Currency', 'Phone region']) expect(screen.queryByText(label)).toBeNull();
    fireEvent.change(screen.getByLabelText('Default language'), { target: { value: 'he' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ language_default: 'he' }));
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderForm();
    await waitFor(() => expect(queryClient.getQueryData(['tenant-locale', 't-1'])).toBeTruthy());
    expect(screen.getByLabelText('שפת ברירת מחדל')).toBeInTheDocument();
    for (const label of ['מדינה', 'מטבע', 'אזור טלפון']) expect(screen.queryByText(label)).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * Settings → Language & Region: the same country choice as the setup wizard.
 * Israel is shown; "Not in Israel?" reveals the choice and the warning; moving
 * to another country needs a tick. A studio already outside Israel sees its
 * country and can save as it is.
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
  it('an Israeli studio sees Israel; moving to another country needs the tick', async () => {
    renderForm();
    expect(await screen.findByRole('group', { name: 'Country' })).toHaveTextContent('Israel');
    expect(screen.queryByRole('combobox', { name: 'Country' })).toBeNull();
    // The saved settings have loaded.
    await waitFor(() => expect(queryClient.getQueryData(['tenant-locale', 't-1'])).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Not in Israel?' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Country' }), { target: { value: 'US' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /My studio will arrange its own payments/ }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ country: 'US' })));
  });

  it('a studio already outside Israel sees its country and the warning, and can save as it is', async () => {
    h.row = { language_default: 'en', country: 'US', currency: 'USD', phone_region: 'US' };
    renderForm();
    const select = await screen.findByRole('combobox', { name: 'Country' });
    await waitFor(() => expect(select).toHaveValue('US'));
    expect(screen.getByRole('note')).toHaveTextContent(/for Israel only/);
    expect(screen.queryByRole('checkbox', { name: /My studio will arrange/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderForm();
    expect(await screen.findByRole('group', { name: 'מדינה' })).toHaveTextContent('ישראל');
    expect(screen.getByRole('button', { name: 'לא בישראל?' })).toBeInTheDocument();
  });
});

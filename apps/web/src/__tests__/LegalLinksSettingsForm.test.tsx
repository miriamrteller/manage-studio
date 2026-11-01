// @vitest-environment jsdom
/**
 * Admin "Legal pages" form: loads the studio URLs, rejects non-https links, saves trimmed
 * values (empty → NULL) and the terms version.
 * Run: pnpm -C apps/web test LegalLinksSettingsForm.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LegalLinksSettingsForm } from '../features/settings/components/LegalLinksSettingsForm';

const { update, eq } = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        update(payload);
        return { eq: (...args: unknown[]) => eq(...args) };
      },
    }),
  },
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    id: 'tenant-1',
    privacy_policy_url: 'https://ballet.example/privacy',
    terms_url: null,
    accessibility_url: null,
    enrolment_terms_version: '1',
  }),
}));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  update.mockReset();
  eq.mockReset();
});

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LegalLinksSettingsForm />
    </QueryClientProvider>,
  );
}

describe('LegalLinksSettingsForm', () => {
  it('loads the current URLs and version', () => {
    renderForm();
    expect(screen.getByLabelText('settings.legal.privacy_policy_url')).toHaveValue('https://ballet.example/privacy');
    expect(screen.getByLabelText('settings.legal.terms_url')).toHaveValue('');
    expect(screen.getByLabelText('settings.legal.terms_version')).toHaveValue('1');
  });

  it('rejects a link that is not https', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('settings.legal.terms_url'), { target: { value: 'http://ballet.example/terms' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('settings.legal.https_required');
    expect(update).not.toHaveBeenCalled();
  });

  it('saves trimmed URLs, NULL for empty ones, and the version', async () => {
    eq.mockResolvedValue({ error: null });
    renderForm();
    fireEvent.change(screen.getByLabelText('settings.legal.terms_url'), { target: { value: '  https://ballet.example/terms ' } });
    fireEvent.change(screen.getByLabelText('settings.legal.terms_version'), { target: { value: '2026-11' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        privacy_policy_url: 'https://ballet.example/privacy',
        terms_url: 'https://ballet.example/terms',
        accessibility_url: null,
        enrolment_terms_version: '2026-11',
      }),
    );
    expect(eq).toHaveBeenCalledWith('id', 'tenant-1');
  });
});

// @vitest-environment jsdom
/**
 * Settings → Features (plans thread): a studio admin sees the non-core features the studio has,
 * by set, and switches one off or back on through the audited set_feature_optout. Fakes only.
 * Run: pnpm -C apps/web test studio-feature-settings.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import en from '../i18n/en.json';
import he from '../i18n/he.json';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key, i18n: { language: 'en' } }),
}));

import {
  StudioFeatureSettings,
  featureLabelKey,
  groupStudioFeatures,
  type StudioFeature,
} from '../features/settings/components/StudioFeatureSettings';

const f = (feature_key: string, feature_set: string, is_on = true): StudioFeature => ({
  feature_key,
  description: feature_key,
  feature_set,
  is_on,
});

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe('rules', () => {
  it('groups by set in order', () => {
    expect(groupStudioFeatures([f('x', 'extras'), f('m', 'monthly'), f('b', 'booking')]).map(([s]) => s)).toEqual([
      'monthly',
      'booking',
      'extras',
    ]);
  });

  it('every switchable feature has an English and a Hebrew label', () => {
    const keys = [
      'billing:recurring.enabled', 'billing:dunning.enabled', 'billing:quotes.generate', 'billing:delivery.gated',
      'media:gallery.gated', 'scheduling:booking.client', 'scheduling:booking.admin',
      'scheduling:integration.google_calendar', 'scheduling:penalties.capture', 'offerings:structure.configure',
      'offerings:booking.public', 'scheduling:calendar.view', 'people:families.manage', 'finance:export.bkmv',
      'ui:theme.dance-studio',
    ];
    const get = (obj: unknown, path: string) =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    for (const key of keys) {
      expect(get(en, featureLabelKey(key)), key).toEqual(expect.any(String));
      expect(get(he, featureLabelKey(key)), key).toEqual(expect.any(String));
    }
  });
});

describe('StudioFeatureSettings', () => {
  it('lists the studio\'s features and switches one off', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'studio_feature_states') {
        return {
          data: [f('billing:dunning.enabled', 'monthly'), f('scheduling:integration.google_calendar', 'booking', false)],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StudioFeatureSettings />
      </QueryClientProvider>,
    );
    const dunning = await screen.findByRole('switch', { name: 'billing:dunning.enabled' });
    expect(dunning).toBeChecked();
    expect(screen.getByRole('switch', { name: 'scheduling:integration.google_calendar' })).not.toBeChecked();
    expect(screen.getByRole('group', { name: 'monthly' })).toBeTruthy();

    fireEvent.click(dunning);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_feature_optout', {
        p_tenant_id: 't1',
        p_feature_key: 'billing:dunning.enabled',
        p_off: true,
      }),
    );
  });
});

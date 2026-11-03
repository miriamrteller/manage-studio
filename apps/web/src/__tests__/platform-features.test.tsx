// @vitest-environment jsdom
/**
 * /platform/features (plans thread): the owner sees one studio's features by set, with what it
 * has by default, and flips them through the audited operator function. Flipping back to the
 * default clears the override. Fakes only.
 * Run: pnpm -C apps/web test platform-features.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => {
      const chain = {
        select: () => chain,
        order: async () => ({ data: [{ id: 't1', name: 'Creative Ballet', subdomain: 'creativeballet', plan: 'essential' }], error: null }),
      };
      return chain;
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key, i18n: { language: 'en' } }),
}));

import { TenantFeatureManager } from '../features/platform/components/TenantFeatureManager';
import { groupBySet } from '../features/platform/components/FeatureTogglePanel';
import { overrideFor } from '../features/platform/services/featureAdminService';
import type { FeatureState } from '../features/platform/types/feature-admin';

const state = (key: string, set: string, default_on: boolean, override_enabled: boolean | null = null): FeatureState => ({
  feature_key: key,
  description: key,
  feature_set: set,
  tier_minimum: set === 'extras' ? 'professional' : 'essential',
  profile_gate: null,
  skin_restriction: null,
  default_on,
  override_enabled,
  override_note: null,
  effective: override_enabled ?? default_on,
});

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe('rules', () => {
  it('flipping back to the default clears the override', () => {
    expect(overrideFor({ default_on: false }, true)).toBe(true);
    expect(overrideFor({ default_on: false }, false)).toBeNull();
    expect(overrideFor({ default_on: true }, false)).toBe(false);
    expect(overrideFor({ default_on: true }, true)).toBeNull();
  });

  it('groups by set in the owner order', () => {
    const groups = groupBySet([state('x', 'extras', false), state('a', 'core', true), state('m', 'monthly', true)]);
    expect(groups.map(([set]) => set)).toEqual(['core', 'monthly', 'extras']);
  });
});

describe('TenantFeatureManager', () => {
  it('shows a studio\'s features and grants an extra through the operator function', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'platform_tenant_feature_states') {
        return { data: [state('people:contacts.manage', 'core', true), state('finance:export.bkmv', 'extras', false)], error: null };
      }
      return { data: null, error: null };
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TenantFeatureManager />
      </QueryClientProvider>,
    );
    const select = await screen.findByLabelText('platform_features.studio');
    await screen.findByRole('option', { name: /Creative Ballet/ });
    fireEvent.change(select, { target: { value: 't1' } });

    const bkmv = await screen.findByRole('switch', { name: 'finance:export.bkmv' });
    expect(bkmv).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'people:contacts.manage' })).toBeChecked();
    expect(screen.getByRole('heading', { name: 'extras' })).toBeTruthy();

    fireEvent.click(bkmv);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('platform_set_feature_override', {
        p_tenant_id: 't1',
        p_feature_key: 'finance:export.bkmv',
        p_enabled: true,
      }),
    );
  });
});

// @vitest-environment jsdom
/**
 * /platform/features: one tick per whole feature (owner, 9 Nov 2026). Business ticks go through
 * set_business_profile (the studio's own "Your business" answers); Google Calendar, photo shop and
 * Takbull testing are per-studio overrides. Superadmin and Grow are never listed; Takbull testing
 * only on the dev website. Fakes only.
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
        order: async () => ({
          data: [
            {
              id: 't1',
              name: 'Test Studio',
              subdomain: 'teststudio',
              plan: 'essential',
              payment_flow: 'recurring',
              teaches_classes: true,
              family_accounts: true,
              client_booking: false,
            },
          ],
          error: null,
        }),
      };
      return chain;
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { TenantFeatureManager } from '../features/platform/components/TenantFeatureManager';
import { FeatureTogglePanel } from '../features/platform/components/FeatureTogglePanel';
import { overrideFor } from '../features/platform/services/featureAdminService';
import {
  isOn,
  listedFeatures,
  lockReason,
  nextPaymentFlow,
  profilePatch,
  WHOLE_FEATURES,
} from '../features/platform/lib/wholeFeatures';
import type { FeatureState } from '../features/platform/types/feature-admin';
import type { StudioProfile } from '@shared/index';

const state = (key: string, default_on: boolean, override_enabled: boolean | null = null): FeatureState => ({
  feature_key: key,
  description: key,
  feature_set: 'extras',
  tier_minimum: 'essential',
  profile_gate: null,
  skin_restriction: null,
  default_on,
  override_enabled,
  override_note: null,
  effective: override_enabled ?? default_on,
});

const profile = (patch: Partial<StudioProfile> = {}): StudioProfile => ({
  paymentFlow: 'recurring',
  teachesClasses: true,
  familyAccounts: true,
  clientBooking: false,
  ...patch,
});

const byId = (id: string) => WHOLE_FEATURES.find((f) => f.id === id)!;

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe('rules', () => {
  it('flipping back to the default clears the override', () => {
    expect(overrideFor({ default_on: false }, true)).toBe(true);
    expect(overrideFor({ default_on: true }, false)).toBe(false);
    expect(overrideFor({ default_on: true }, true)).toBeNull();
  });

  it('lists the whole features, never superadmin or Grow, Takbull testing only on dev', () => {
    const live = listedFeatures(false).map((f) => f.id);
    expect(live).toEqual(['classes', 'families', 'monthly', 'projects', 'booking', 'google_calendar', 'photo_shop', 'studio_shop']);
    expect(listedFeatures(true).map((f) => f.id)).toContain('takbull_testing');
    const keys = WHOLE_FEATURES.map((f) => f.featureKey ?? '');
    expect(keys.some((k) => k.includes('admin.super') || k.includes('grow'))).toBe(false);
  });

  it('payment flow: monthly and projects combine, and one must stay on', () => {
    expect(nextPaymentFlow('recurring', 'projects', true)).toBe('both');
    expect(nextPaymentFlow('both', 'monthly', false)).toBe('project');
    expect(nextPaymentFlow('recurring', 'monthly', false)).toBeNull();
    expect(lockReason(byId('monthly'), profile(), [])).toBe('last_payment_way');
    expect(lockReason(byId('monthly'), profile({ paymentFlow: 'both' }), [])).toBeNull();
  });

  it('families is part of classes: off with it, and locked while classes is off', () => {
    expect(profilePatch('classes', false, profile())).toEqual({ p_teaches_classes: false, p_family_accounts: false });
    const noClasses = profile({ teachesClasses: false });
    expect(isOn(byId('families'), noClasses, [])).toBe(false);
    expect(lockReason(byId('families'), noClasses, [])).toBe('needs_parent');
  });

  it('Google Calendar is locked while online booking is off', () => {
    expect(lockReason(byId('google_calendar'), profile({ clientBooking: false }), [])).toBe('needs_parent');
    expect(lockReason(byId('google_calendar'), profile({ clientBooking: true }), [])).toBeNull();
  });
});

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);

describe('TenantFeatureManager', () => {
  it('a business tick changes the studio\'s own answer; photo shop is an override', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'platform_tenant_feature_states') {
        return { data: [state('billing:photo_shop', false), state('platform:admin.super', true)], error: null };
      }
      return { data: null, error: null };
    });
    render(wrap(<TenantFeatureManager />));
    const select = await screen.findByLabelText('platform_features.studio');
    await screen.findByRole('option', { name: /Test Studio/ });
    fireEvent.change(select, { target: { value: 't1' } });

    const projects = await screen.findByRole('switch', { name: 'platform_features.whole.projects.label' });
    expect(projects).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'platform_features.whole.classes.label' })).toBeChecked();
    expect(screen.queryByText(/admin\.super/)).toBeNull();

    fireEvent.click(projects);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_business_profile', { p_tenant_id: 't1', p_payment_flow: 'both' }),
    );

    fireEvent.click(await screen.findByRole('switch', { name: 'platform_features.whole.photo_shop.label' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('platform_set_feature_override', {
        p_tenant_id: 't1',
        p_feature_key: 'billing:photo_shop',
        p_enabled: true,
      }),
    );
  });

  it('the live site has no Takbull testing tick', () => {
    render(wrap(<FeatureTogglePanel profile={profile()} features={[]} tenantId="t1" devSite={false} />));
    expect(screen.queryByRole('switch', { name: 'platform_features.whole.takbull_testing.label' })).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(8);
  });
});

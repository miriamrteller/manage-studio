import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';

export interface StudioFeature {
  feature_key: string;
  description: string;
  feature_set: string;
  is_on: boolean;
}

/** The order the sets are shown in (core is never listed: it can't be switched off). */
const SET_ORDER = ['monthly', 'projects', 'booking', 'classes', 'families', 'extras'];

/** "billing:dunning.enabled" → "billing_dunning_enabled" (i18n keys can't hold ":" or "."). */
export function featureLabelKey(featureKey: string): string {
  return `settings.features.keys.${featureKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/** Pure: the studio's features grouped by set, in order. */
export function groupStudioFeatures(features: StudioFeature[]): [string, StudioFeature[]][] {
  const sets = [...new Set([...SET_ORDER, ...features.map((f) => f.feature_set)])];
  return sets
    .map((set) => [set, features.filter((f) => f.feature_set === set)] as [string, StudioFeature[]])
    .filter(([, items]) => items.length > 0);
}

export const STUDIO_FEATURES_QUERY = 'studio-features';

/**
 * Settings: "Features". Everything the studio has, beyond the core, with a switch to stop using
 * it and turn it back on. Switching off only hides it: monthly fees, payments and receipts carry
 * on, and nothing is deleted. Features the studio doesn't have aren't listed (OpalSwift sets
 * those); "Your business" decides the big areas.
 */
export function StudioFeatureSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const queryClient = useQueryClient();

  const features = useQuery({
    queryKey: [STUDIO_FEATURES_QUERY, tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('studio_feature_states', { p_tenant_id: tenant!.id });
      if (error) throw error;
      return (data ?? []) as StudioFeature[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ featureKey, on }: { featureKey: string; on: boolean }) => {
      const { error } = await supabase.rpc('set_feature_optout', {
        p_tenant_id: tenant!.id,
        p_feature_key: featureKey,
        p_off: !on,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [STUDIO_FEATURES_QUERY, tenant?.id] });
      void queryClient.invalidateQueries({ queryKey: ['featureGate', tenant?.id] });
    },
  });

  if (!tenant) return null;
  const groups = groupStudioFeatures(features.data ?? []);

  return (
    <section className="space-y-6" aria-labelledby={`${id}-title`}>
      <header className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('settings.features.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.features.intro')}</p>
      </header>

      {features.isLoading && <p role="status">{t('common.loading')}</p>}
      {features.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.features.load_failed')}
        </p>
      )}
      {toggle.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.features.save_failed')}
        </p>
      )}
      {features.data && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('settings.features.none')}</p>
      )}

      {groups.map(([set, items]) => (
        <fieldset key={set} className="space-y-2">
          <legend className="text-sm font-medium">{t(`settings.features.sets.${set}`, { defaultValue: set })}</legend>
          <ul className="space-y-2">
            {items.map((feature) => {
              const inputId = `${id}-${feature.feature_key.replace(/[^a-zA-Z0-9]/g, '-')}`;
              return (
                <li key={feature.feature_key} className="flex items-center gap-2 text-sm">
                  <input
                    id={inputId}
                    type="checkbox"
                    role="switch"
                    checked={feature.is_on}
                    disabled={toggle.isPending}
                    onChange={(e) => toggle.mutate({ featureKey: feature.feature_key, on: e.target.checked })}
                  />
                  <label htmlFor={inputId}>
                    {t(featureLabelKey(feature.feature_key), { defaultValue: feature.description })}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </section>
  );
}

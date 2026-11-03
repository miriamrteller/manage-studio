import { useTranslation } from 'react-i18next';
import { FEATURE_SETS, type FeatureState } from '../types/feature-admin';
import { useSetFeatureOverride } from '../hooks/useFeatureAdmin';
import { overrideFor } from '../services/featureAdminService';

interface Props {
  features: FeatureState[];
  tenantId: string;
}

/** Pure: features grouped by set, in the owner's order; unknown sets go last. */
export function groupBySet(features: FeatureState[]): [string, FeatureState[]][] {
  const order = [...FEATURE_SETS, ...new Set(features.map((f) => f.feature_set))];
  return [...new Set(order)]
    .map((set) => [set, features.filter((f) => f.feature_set === set)] as [string, FeatureState[]])
    .filter(([, items]) => items.length > 0);
}

/**
 * What one studio HAS, by set. The switch shows whether the studio has the feature now; flipping
 * it away from the default stores the owner's grant or removal, flipping it back clears it.
 */
export function FeatureTogglePanel({ features, tenantId }: Props) {
  const { t } = useTranslation();
  const mutation = useSetFeatureOverride(tenantId);

  return (
    <div className="space-y-8">
      {mutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          {t('platform_features.save_failed')}
        </p>
      )}
      {groupBySet(features).map(([set, items]) => (
        <section key={set} aria-labelledby={`feature-set-${set}`}>
          <h2 id={`feature-set-${set}`} className="mb-1 text-base font-semibold">
            {t(`platform_features.sets.${set}`, { defaultValue: set })}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {t(`platform_features.set_hints.${set}`, { defaultValue: '' })}
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((feature) => {
              const id = `feature-${feature.feature_key.replace(/[^a-z0-9]/gi, '-')}`;
              const overridden = feature.override_enabled !== null;
              return (
                <li key={feature.feature_key} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="text-sm font-medium">
                      {feature.description}
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {feature.default_on ? t('platform_features.default_on') : t('platform_features.default_off')}
                      {overridden &&
                        ` · ${feature.override_enabled ? t('platform_features.granted') : t('platform_features.removed')}`}
                    </p>
                    <code dir="ltr" className="text-xs text-muted-foreground">
                      {feature.feature_key}
                    </code>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    {overridden && (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline underline-offset-2"
                        onClick={() => mutation.mutate({ featureKey: feature.feature_key, enabled: null })}
                        disabled={mutation.isPending}
                      >
                        {t('platform_features.reset')}
                      </button>
                    )}
                    <input
                      id={id}
                      type="checkbox"
                      role="switch"
                      className="h-5 w-5"
                      checked={feature.effective}
                      onChange={(e) =>
                        mutation.mutate({
                          featureKey: feature.feature_key,
                          enabled: overrideFor(feature, e.target.checked),
                        })
                      }
                      disabled={mutation.isPending}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

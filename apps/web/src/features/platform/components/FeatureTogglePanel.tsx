import type { FeatureDefinition, FeatureOverride } from '../types/feature-admin';
import { useResetFeature, useToggleFeature } from '../hooks/useFeatureAdmin';

interface Props {
  features: FeatureDefinition[];
  overrides: FeatureOverride[];
  tenantId: string;
}

const CATEGORY_ORDER = [
  'scheduling',
  'billing',
  'messaging',
  'finance',
  'documents',
  'admin',
  'platform',
];

const CATEGORY_LABELS: Record<string, string> = {
  scheduling: 'Scheduling',
  billing: 'Billing',
  messaging: 'Messaging',
  finance: 'Finance',
  documents: 'Documents',
  admin: 'Admin',
  platform: 'Platform',
};

function badgeClass(value: string | null) {
  if (!value) return '';
  return value === 'essential'
    ? 'badge badge-sm badge-outline badge-info'
    : 'badge badge-sm badge-outline badge-accent';
}

export function FeatureTogglePanel({ features, overrides, tenantId }: Props) {
  const toggleMutation = useToggleFeature(tenantId);
  const resetMutation = useResetFeature(tenantId);

  const overrideMap = new Map(overrides.map((o) => [o.feature_key, o]));

  // Group features by category in defined order
  const grouped = CATEGORY_ORDER.reduce<Record<string, FeatureDefinition[]>>((acc, cat) => {
    const items = features.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // Catch any categories not in CATEGORY_ORDER
  features.forEach((f) => {
    if (!grouped[f.category]) grouped[f.category] = [];
    if (!grouped[f.category].includes(f)) grouped[f.category].push(f);
  });

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-base-content/50 mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="divide-y divide-base-200 rounded-xl border border-base-200 bg-base-100">
            {items.map((feature) => {
              const override = overrideMap.get(feature.feature_key);
              const isOverridden = override !== undefined;
              // Effective state: override wins, else default
              const effectiveEnabled = isOverridden ? override!.enabled : feature.default_enabled;

              return (
                <div
                  key={feature.feature_key}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{feature.label}</span>
                      {feature.tier_minimum && (
                        <span className={badgeClass(feature.tier_minimum)}>
                          {feature.tier_minimum}
                        </span>
                      )}
                      {feature.skin_restriction && (
                        <span className={badgeClass(feature.skin_restriction)}>
                          skin: {feature.skin_restriction}
                        </span>
                      )}
                      {isOverridden && (
                        <span className="badge badge-sm badge-warning">overridden</span>
                      )}
                    </div>
                    <p className="text-xs text-base-content/60 mt-0.5">{feature.description}</p>
                    <code className="text-xs text-base-content/40">{feature.feature_key}</code>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {isOverridden && (
                      <button
                        className="btn btn-xs btn-ghost text-base-content/40"
                        title="Reset to default"
                        onClick={() => resetMutation.mutate(feature.feature_key)}
                        disabled={resetMutation.isPending}
                      >
                        reset
                      </button>
                    )}
                    <input
                      type="checkbox"
                      className="toggle toggle-sm toggle-primary"
                      checked={effectiveEnabled}
                      onChange={(e) =>
                        toggleMutation.mutate({
                          featureKey: feature.feature_key,
                          enabled: e.target.checked,
                          isCurrentlyOverridden: isOverridden,
                          defaultEnabled: feature.default_enabled,
                        })
                      }
                      disabled={toggleMutation.isPending}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

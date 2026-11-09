import { useTranslation } from 'react-i18next';
import type { StudioProfile } from '@shared/index';
import { isDevSite } from '@/lib/devStudioPicker';
import type { FeatureState } from '../types/feature-admin';
import { useSetWholeFeature } from '../hooks/useFeatureAdmin';
import { isOn, listedFeatures, lockReason, type WholeFeature } from '../lib/wholeFeatures';

interface Props {
  profile: StudioProfile;
  features: FeatureState[];
  tenantId: string;
  /** Defaults to the build: the dev website lists testing-only features too. */
  devSite?: boolean;
}

const SECTIONS = ['features', 'beta', 'testing'] as const;

/** One studio's whole features: one tick each. A feature that is part of another sits under it. */
export function FeatureTogglePanel({ profile, features, tenantId, devSite = isDevSite() }: Props) {
  const { t } = useTranslation();
  const mutation = useSetWholeFeature(tenantId);
  const listed = listedFeatures(devSite);

  const row = (feature: WholeFeature) => {
    const id = `whole-feature-${feature.id}`;
    const on = isOn(feature, profile, features);
    const lock = lockReason(feature, profile, features);
    return (
      <li
        key={feature.id}
        className={`flex items-start justify-between gap-4 px-4 py-3${feature.partOf ? ' ps-10' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={`text-sm font-medium${lock === 'needs_parent' ? ' text-muted-foreground' : ''}`}>
            {t(`platform_features.whole.${feature.id}.label`)}
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(`platform_features.whole.${feature.id}.hint`)}</p>
          {lock && (
            <p className="mt-0.5 text-xs text-muted-foreground">{t(`platform_features.lock.${lock}`)}</p>
          )}
        </div>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={on}
          disabled={mutation.isPending || lock !== null}
          onChange={(e) => mutation.mutate({ feature, on: e.target.checked, profile, states: features })}
        />
      </li>
    );
  };

  return (
    <div className="space-y-8">
      {mutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          {t('platform_features.save_failed')}
        </p>
      )}
      {SECTIONS.map((section) => {
        const items = listed.filter((f) => f.section === section);
        if (items.length === 0) return null;
        return (
          <section key={section} aria-labelledby={`feature-section-${section}`}>
            <h2 id={`feature-section-${section}`} className="mb-1 text-base font-semibold">
              {t(`platform_features.sections.${section}`)}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">{t(`platform_features.section_hints.${section}`)}</p>
            <ul className="divide-y divide-border rounded-lg border border-border">{items.map(row)}</ul>
          </section>
        );
      })}
    </div>
  );
}

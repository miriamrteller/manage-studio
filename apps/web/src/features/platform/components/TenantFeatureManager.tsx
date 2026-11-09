import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { profileFromTenant } from '@shared/index';
import { useFeatureStates, useTenants } from '../hooks/useFeatureAdmin';
import { FeatureTogglePanel } from './FeatureTogglePanel';

/** /platform/features: the owner chooses a studio and sets which features it has. */
export function TenantFeatureManager() {
  const { t } = useTranslation();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const states = useFeatureStates(tenantId);
  const tenant = tenants.find((x) => x.id === tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('platform_features.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('platform_features.intro')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label htmlFor="tenant-feature-manager-select" className="shrink-0 text-sm font-medium">
          {t('platform_features.studio')}
        </label>
        <select
          id="tenant-feature-manager-select"
          className="form-input w-full max-w-xs"
          value={tenantId ?? ''}
          disabled={tenantsLoading}
          onChange={(e) => setTenantId(e.target.value || null)}
        >
          <option value="">{t('platform_features.choose_studio')}</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name} ({tenant.subdomain}){tenant.plan ? ` · ${t(`platform_features.plans.${tenant.plan}`)}` : ''}
            </option>
          ))}
        </select>
      </div>

      {!tenantId && (
        <p className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {t('platform_features.pick_hint')}
        </p>
      )}
      {tenantId && states.isLoading && <p role="status">{t('common.loading')}</p>}
      {tenantId && states.isError && (
        <p role="alert" className="text-sm text-red-700">
          {t('platform_features.load_failed')}
        </p>
      )}
      {tenantId && tenant && states.data && (
        <FeatureTogglePanel profile={profileFromTenant(tenant)} features={states.data} tenantId={tenantId} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useFeatureDefinitions, useTenantOverrides, useTenants } from '../hooks/useFeatureAdmin';
import { FeatureTogglePanel } from './FeatureTogglePanel';

export function TenantFeatureManager() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const { data: features = [], isLoading: featuresLoading } = useFeatureDefinitions();
  const { data: overrides = [], isLoading: overridesLoading } = useTenantOverrides(selectedTenantId);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const isLoading = tenantsLoading || featuresLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="text-base-content/60 text-sm mt-1">
          Manage per-tenant feature overrides. Changes take effect immediately.
        </p>
      </div>

      {/* Tenant selector */}
      <div className="flex items-center gap-4">
        <label htmlFor="tenant-feature-manager-select" className="text-sm font-medium shrink-0">
          Tenant
        </label>
        {tenantsLoading ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          <select
            id="tenant-feature-manager-select"
            className="select select-bordered select-sm w-72"
            value={selectedTenantId ?? ''}
            onChange={(e) => setSelectedTenantId(e.target.value || null)}
          >
            <option value="">— select a tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.subdomain}) {t.plan ? `· ${t.plan}` : ''}
              </option>
            ))}
          </select>
        )}
        {selectedTenant && (
          <span className="text-xs text-base-content/50">
            {overrides.length} override{overrides.length !== 1 ? 's' : ''} active
          </span>
        )}
      </div>

      {/* Feature list */}
      {!selectedTenantId && (
        <div className="rounded-xl border border-dashed border-base-300 p-12 text-center text-base-content/40 text-sm">
          Select a tenant above to manage its features
        </div>
      )}

      {selectedTenantId && (isLoading || overridesLoading) && (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      )}

      {selectedTenantId && !isLoading && !overridesLoading && (
        <FeatureTogglePanel
          features={features}
          overrides={overrides}
          tenantId={selectedTenantId}
        />
      )}
    </div>
  );
}

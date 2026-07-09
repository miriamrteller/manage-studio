import { supabase } from '../../../lib/supabase';
import type { FeatureDefinition, FeatureOverride, TenantOption } from '../types/feature-admin';

export async function fetchAllFeatureDefinitions(): Promise<FeatureDefinition[]> {
  const { data, error } = await supabase
    .from('feature_definitions')
    .select('feature_key, label, description, category, tier_minimum, skin_restriction, default_enabled')
    .order('category')
    .order('feature_key');

  if (error) throw new Error(`Failed to fetch feature definitions: ${error.message}`);
  return data ?? [];
}

export async function fetchTenants(): Promise<TenantOption[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, subdomain, plan')
    .order('name');

  if (error) throw new Error(`Failed to fetch tenants: ${error.message}`);
  return data ?? [];
}

export async function fetchTenantOverrides(tenantId: string): Promise<FeatureOverride[]> {
  const { data, error } = await supabase
    .from('tenant_feature_overrides')
    .select('id, tenant_id, feature_key, enabled, updated_at')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(`Failed to fetch overrides: ${error.message}`);
  return data ?? [];
}

export async function upsertOverride(
  tenantId: string,
  featureKey: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('tenant_feature_overrides')
    .upsert(
      { tenant_id: tenantId, feature_key: featureKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,feature_key' },
    );

  if (error) throw new Error(`Failed to upsert override: ${error.message}`);
}

export async function deleteOverride(tenantId: string, featureKey: string): Promise<void> {
  const { error } = await supabase
    .from('tenant_feature_overrides')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('feature_key', featureKey);

  if (error) throw new Error(`Failed to delete override: ${error.message}`);
}

import { supabase } from '../../../lib/supabase';
import type { FeatureState, TenantOption } from '../types/feature-admin';

export async function fetchTenants(): Promise<TenantOption[]> {
  const { data, error } = await supabase.from('tenants').select('id, name, subdomain, plan').order('name');
  if (error) throw new Error(`Failed to fetch studios: ${error.message}`);
  return (data ?? []) as TenantOption[];
}

/** Every feature for one studio: its set, default and the owner's override (operator only). */
export async function fetchFeatureStates(tenantId: string): Promise<FeatureState[]> {
  const { data, error } = await supabase.rpc('platform_tenant_feature_states', { p_tenant_id: tenantId });
  if (error) throw new Error(`Failed to fetch features: ${error.message}`);
  return (data ?? []) as FeatureState[];
}

/** enabled: true = grant, false = remove, null = back to the default. Audited in the database. */
export async function setFeatureOverride(
  tenantId: string,
  featureKey: string,
  enabled: boolean | null,
): Promise<void> {
  const { error } = await supabase.rpc('platform_set_feature_override', {
    p_tenant_id: tenantId,
    p_feature_key: featureKey,
    p_enabled: enabled,
  });
  if (error) throw new Error(`Failed to change feature: ${error.message}`);
}

/**
 * Pure: the override to store when the owner flips a feature to `next`. Flipping back to what
 * the studio gets by default clears the override, so later plan or profile changes apply again.
 */
export function overrideFor(state: Pick<FeatureState, 'default_on'>, next: boolean): boolean | null {
  return next === state.default_on ? null : next;
}

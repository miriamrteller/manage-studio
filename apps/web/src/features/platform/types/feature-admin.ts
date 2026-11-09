/** The sets the owner approved; each feature belongs to exactly one. */
export const FEATURE_SETS = ['core', 'monthly', 'projects', 'booking', 'classes', 'families', 'extras'] as const;
export type FeatureSet = (typeof FEATURE_SETS)[number];

/** One feature for one studio, from platform_tenant_feature_states. */
export interface FeatureState {
  feature_key: string;
  description: string;
  feature_set: string;
  tier_minimum: 'essential' | 'professional';
  profile_gate: string | null;
  skin_restriction: string | null;
  /** On from the studio's plan and business profile, before the owner's override. */
  default_on: boolean;
  /** true = granted by the owner, false = removed by the owner, null = default. */
  override_enabled: boolean | null;
  override_note: string | null;
  effective: boolean;
}

export interface TenantOption {
  id: string;
  name: string;
  subdomain: string;
  plan: 'essential' | 'professional' | null;
  payment_flow?: string | null;
  teaches_classes?: boolean | null;
  family_accounts?: boolean | null;
  client_booking?: boolean | null;
}

export interface FeatureDefinition {
  feature_key: string;
  label: string;
  description: string;
  category: string;
  tier_minimum: 'essential' | 'professional' | null;
  skin_restriction: 'essential' | 'professional' | null;
  default_enabled: boolean;
}

export interface FeatureOverride {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  updated_at: string;
}

export interface TenantOption {
  id: string;
  name: string;
  subdomain: string;
  plan: 'essential' | 'professional' | null;
}

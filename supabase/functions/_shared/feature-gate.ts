/**
 * Deno feature gate for Supabase Edge Functions.
 *
 * Usage in an edge function:
 *   import { requireFeature } from '../_shared/feature-gate.ts';
 *   await requireFeature(tenantId, 'billing:payments.grow', supabaseAdmin);
 *
 * Behaviour:
 *   - 5-minute in-memory TTL cache per tenant (cache is per Deno isolate — resets on cold start).
 *   - Fail-open on Supabase timeout or error: logs a warning and allows the request through.
 *   - Throws Response(403) JSON if the feature is not in the tenant's enabled set.
 *
 * The RPC `get_tenant_features(p_tenant_id)` is created by the Batch 3 SQL migration.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const featureCache = new Map<string, { features: Set<string>; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const SUPABASE_TIMEOUT_MS = 3_000;

async function fetchFeatures(
  tenantId: string,
  supabaseAdmin: SupabaseClient
): Promise<Set<string>> {
  const cached = featureCache.get(tenantId);
  const now = Date.now();

  if (cached && cached.expiry > now) {
    return cached.features;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

    const { data, error } = await supabaseAdmin.rpc('get_tenant_features', {
      p_tenant_id: tenantId,
    });

    clearTimeout(timeoutId);

    if (error) {
      console.error('[FEATURE_GATE] fetch failed', { tenantId, error: error.message });
      return new Set();
    }

    const features = new Set(data as string[]);
    featureCache.set(tenantId, { features, expiry: now + CACHE_TTL_MS });
    return features;
  } catch (err) {
    console.error('[FEATURE_GATE] fetch timeout', { tenantId, error: String(err) });
    return new Set();
  }
}

export async function requireFeature(
  tenantId: string,
  featureKey: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  const features = await fetchFeatures(tenantId, supabaseAdmin);

  if (features.size === 0) {
    console.warn('[FEATURE_GATE] fail-open (empty feature set)', { tenantId, featureKey });
    return;
  }

  if (!features.has(featureKey)) {
    console.warn('[FEATURE_GATE] denial', JSON.stringify({
      tenant_id: tenantId,
      feature_key: featureKey,
      reason: 'feature_not_in_enabled_set',
      timestamp: new Date().toISOString(),
    }));

    throw new Response(
      JSON.stringify({ error: 'feature_not_available', feature: featureKey }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function getTenantFeatures(
  tenantId: string,
  supabaseAdmin: SupabaseClient
): Promise<Set<string>> {
  return fetchFeatures(tenantId, supabaseAdmin);
}

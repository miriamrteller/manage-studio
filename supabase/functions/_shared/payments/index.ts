import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { MockPaymentProvider } from "./providers/mock.ts";
import { StripePaymentProvider } from "./providers/stripe.ts";
import { parsePaymentProviderSlug, type PaymentProviderSlug } from "./registry.ts";
import type { PaymentProvider } from "./types.ts";

export function getPaymentProvider(
  service: SupabaseClient,
  slug: string | null | undefined,
): PaymentProvider {
  const parsed: PaymentProviderSlug = parsePaymentProviderSlug(slug);
  switch (parsed) {
    case "mock":
      return new MockPaymentProvider();
    case "stripe":
      return new StripePaymentProvider(service);
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

export async function getPaymentProviderForTenant(
  service: SupabaseClient,
  tenantId: string,
): Promise<PaymentProvider> {
  const { data, error } = await service
    .from("tenants")
    .select("payment_provider")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  return getPaymentProvider(service, data.payment_provider as string);
}

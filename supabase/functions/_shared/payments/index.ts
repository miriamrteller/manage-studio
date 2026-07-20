import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getEnv } from "../env.ts";
import { MockPaymentProvider } from "./providers/mock.ts";
import { MockGrowPaymentProvider } from "./providers/mock-grow.ts";
import { MockIcountPaymentProvider } from "./providers/mock-icount.ts";
import { MockInvoice4uPaymentProvider } from "./providers/mock-invoice4u.ts";
import { GrowPaymentProvider } from "./providers/grow.ts";
import { IcountPaymentProvider } from "./providers/icount.ts";
import { Invoice4uPaymentProvider } from "./providers/invoice4u.ts";
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
    case "grow":
      // Never hit the live Meshulam API in CI/dev — use the mock when GROW_MOCK=true.
      return getEnv("GROW_MOCK") === "true"
        ? new MockGrowPaymentProvider()
        : new GrowPaymentProvider(service);
    case "icount":
      return getEnv("ICOUNT_MOCK") === "true"
        ? new MockIcountPaymentProvider()
        : new IcountPaymentProvider(service);
    case "invoice4u":
      return getEnv("INVOICE4U_MOCK") === "true"
        ? new MockInvoice4uPaymentProvider()
        : new Invoice4uPaymentProvider(service);
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

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getEnv } from "../env.ts";
import { MockPaymentProvider } from "./providers/mock.ts";
import { MockGrowPaymentProvider } from "./providers/mock-grow.ts";
import { MockIcountPaymentProvider } from "./providers/mock-icount.ts";
import { MockRapydAdapter } from "./providers/mock-rapyd.ts";
import { MockYeshAdapter } from "./providers/mock-yesh.ts";
import { GrowPaymentProvider } from "./providers/grow.ts";
import { IcountPaymentProvider } from "./providers/icount.ts";
import { StripePaymentProvider } from "./providers/stripe.ts";
import { createRapydAdapter } from "./providers/rapyd.ts";
import { YeshInvoiceAdapter } from "./providers/yesh.ts";
import {
  parsePaymentProviderSlug,
  parseInvoicingProviderSlug,
  type PaymentProviderSlug,
  type InvoicingProviderSlug,
} from "./registry.ts";
import type { PaymentProvider } from "./types.ts";
import type { IInvoicingProvider } from "./providers/invoicing-types.ts";

// ---------------------------------------------------------------------------
// Payment provider factory
// ---------------------------------------------------------------------------

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
      return getEnv("GROW_MOCK") === "true"
        ? new MockGrowPaymentProvider()
        : new GrowPaymentProvider(service);
    case "icount":
      return getEnv("ICOUNT_MOCK") === "true"
        ? new MockIcountPaymentProvider()
        : new IcountPaymentProvider(service);
    case "rapyd":
      // RapydAdapter requires async credential loading — use getPaymentProviderForTenant
      throw new Error("rapyd provider requires tenant context — use getPaymentProviderForTenant()");
    case "icount_paypage":
      // iCount PayPage adapter pending — uses same IcountPaymentProvider CC-page redirect for now
      return getEnv("ICOUNT_MOCK") === "true"
        ? new MockIcountPaymentProvider()
        : new IcountPaymentProvider(service);
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

  const slug = parsePaymentProviderSlug(data.payment_provider as string);

  if (slug === "rapyd") {
    // RapydAdapter requires async credential loading
    if (getEnv("RAPYD_MOCK") === "true") {
      return new MockRapydAdapter() as unknown as PaymentProvider;
    }
    return createRapydAdapter(service, tenantId) as unknown as PaymentProvider;
  }

  return getPaymentProvider(service, slug);
}

// ---------------------------------------------------------------------------
// Invoicing provider factory
// ---------------------------------------------------------------------------

export async function getInvoicingProviderForTenant(
  service: SupabaseClient,
  tenantId: string,
): Promise<IInvoicingProvider> {
  const { data, error } = await service
    .from("tenants")
    .select("invoicing_provider")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const slug = parseInvoicingProviderSlug(data.invoicing_provider as string);

  switch (slug) {
    case "yesh":
      if (getEnv("YESH_MOCK") === "true") {
        return new MockYeshAdapter();
      }
      return new YeshInvoiceAdapter(service);

    case "icount":
    case "green_invoice":
    case "grow":
      // These invoicing providers use their own adapters — stub for now
      throw new Error(`Invoicing provider '${slug}' adapter not yet implemented for this factory`);

    default: {
      const _exhaustive: never = slug;
      return _exhaustive;
    }
  }
}

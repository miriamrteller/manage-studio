import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { MockInvoicingProvider } from "./providers/mock.ts";
import { GreenInvoiceProvider } from "./providers/green-invoice.ts";
import { GrowInvoicingProvider } from "./providers/grow.ts";
import { IcountInvoicingProvider } from "./providers/icount.ts";
import { parseInvoicingProviderSlug, type InvoicingProviderSlug } from "./registry.ts";
import type { InvoicingProvider } from "./types.ts";

const mockProvider = new MockInvoicingProvider();
const greenInvoiceProvider = new GreenInvoiceProvider();
const growProvider = new GrowInvoicingProvider();
const icountProvider = new IcountInvoicingProvider();

export function getInvoicingProvider(slug: string | null | undefined): InvoicingProvider {
  const parsed: InvoicingProviderSlug = parseInvoicingProviderSlug(slug);
  switch (parsed) {
    case "mock":
      return mockProvider;
    case "green_invoice":
      return greenInvoiceProvider;
    case "grow":
      return growProvider;
    case "icount":
      return icountProvider;
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

export async function getInvoicingProviderForTenant(
  service: SupabaseClient,
  tenantId: string,
): Promise<InvoicingProvider> {
  const { data, error } = await service
    .from("tenants")
    .select("invoicing_provider")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  return getInvoicingProvider(data.invoicing_provider as string);
}

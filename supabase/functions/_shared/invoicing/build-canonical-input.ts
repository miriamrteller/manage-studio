import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { CanonicalDocumentInput, DocumentKind } from "./types.ts";
import { InvoicingProviderError } from "./types.ts";

interface BuildParams {
  paymentId: string;
  documentKind: DocumentKind;
}

interface PaymentRow {
  id: string;
  tenant_id: string;
  person_id: string | null;
  billing_account_id: string | null;
  engagement_id: string | null;
  pretax_amount_minor: number;
  vat_amount_minor: number;
  total_amount_minor: number;
  currency: string;
  vat_rate: number;
  refunds_payment_id: string | null;
}

function parseLanguage(value: string | null | undefined): "he" | "en" {
  return value === "en" ? "en" : "he";
}

export async function buildCanonicalDocumentInput(
  service: SupabaseClient,
  params: BuildParams,
): Promise<CanonicalDocumentInput> {
  const { data: payment, error: paymentError } = await service
    .from("payments")
    .select(
      "id, tenant_id, person_id, billing_account_id, engagement_id, pretax_amount_minor, vat_amount_minor, total_amount_minor, currency, vat_rate, refunds_payment_id",
    )
    .eq("id", params.paymentId)
    .single();

  if (paymentError || !payment) {
    throw new InvoicingProviderError(`Payment not found: ${params.paymentId}`, {
      retryable: false,
    });
  }

  const row = payment as PaymentRow;
  let billingAccountId = row.billing_account_id;

  if (!billingAccountId && row.engagement_id) {
    const { data: engagement } = await service
      .from("engagements")
      .select("billing_account_id")
      .eq("id", row.engagement_id)
      .maybeSingle();
    billingAccountId = (engagement?.billing_account_id as string | null) ?? null;
  }

  let buyer: CanonicalDocumentInput["buyer"];
  if (billingAccountId) {
    const { data: billingAccount } = await service
      .from("billing_accounts")
      .select("business_tax_id, business_name")
      .eq("id", billingAccountId)
      .maybeSingle();
    if (billingAccount?.business_tax_id || billingAccount?.business_name) {
      buyer = {
        businessTaxId: (billingAccount.business_tax_id as string | null) ?? undefined,
        businessName: (billingAccount.business_name as string | null) ?? undefined,
      };
    }
  }

  if (!row.person_id) {
    throw new InvoicingProviderError("Payment missing person_id for document payer", {
      retryable: false,
    });
  }

  const { data: person, error: personError } = await service
    .from("people")
    .select("name, email")
    .eq("id", row.person_id)
    .single();

  if (personError || !person?.name) {
    throw new InvoicingProviderError("Payer person not found", { retryable: false });
  }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("language_default")
    .eq("id", row.tenant_id)
    .single();

  if (tenantError || !tenant) {
    throw new InvoicingProviderError("Tenant not found", { retryable: false });
  }

  let originalExternalDocumentId: string | undefined;
  if (params.documentKind === "refund" && row.refunds_payment_id) {
    const { data: original } = await service
      .from("payments")
      .select("external_document_id")
      .eq("id", row.refunds_payment_id)
      .maybeSingle();
    originalExternalDocumentId =
      (original?.external_document_id as string | null) ?? undefined;
  }

  return {
    tenantId: row.tenant_id,
    paymentId: row.id,
    documentKind: params.documentKind,
    language: parseLanguage(tenant.language_default as string | null),
    currency: row.currency,
    pretaxAmountMinor: row.pretax_amount_minor,
    vatAmountMinor: row.vat_amount_minor,
    totalAmountMinor: row.total_amount_minor,
    vatRate: Number(row.vat_rate),
    payer: {
      name: person.name as string,
      email: (person.email as string | null) ?? undefined,
    },
    buyer,
    originalExternalDocumentId,
  };
}

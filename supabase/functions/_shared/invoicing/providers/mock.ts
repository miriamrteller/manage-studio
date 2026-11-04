import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type {
  AuthHealthResult,
  CanonicalDocumentInput,
  ExternalDocumentResult,
  InvoicingProvider,
} from "../types.ts";

export class MockInvoicingProvider implements InvoicingProvider {
  readonly slug = "mock";

  async authenticate(_service: SupabaseClient, _tenantId: string): Promise<void> {
    // No-op — mock never calls external auth.
  }

  async issueDocument(
    _service: SupabaseClient,
    input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    const suffix = input.documentKind === "refund" ? "CN" : "INV";
    const number = `MOCK-${suffix}-${input.paymentId.slice(0, 8).toUpperCase()}`;
    return {
      externalDocumentId: `mock-doc-${input.paymentId}`,
      externalDocumentNumber: number,
      documentUrl: `https://mock.invoicing.local/${input.paymentId}`,
      documentKind: input.documentKind === "refund" ? "credit_note" : "tax_invoice_receipt",
    };
  }

  async checkAuthHealth(): Promise<AuthHealthResult> {
    return { valid: true, message: "Mock provider — always valid" };
  }
}

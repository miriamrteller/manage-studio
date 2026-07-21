import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  InvoicingProviderError,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * Invoice4U invoicing adapter — stub.
 *
 * Invoice4U issues the tax document together with the payment (bundled via
 * IsDocCreate / callback DocCreated). Standalone `issueDocument` is not supported.
 */
export class Invoice4uInvoicingProvider implements InvoicingProvider {
  readonly slug = "invoice4u";

  async authenticate(_service: SupabaseClient, _tenantId: string): Promise<void> {
    // Bundled path — document arrives via payment callback (U2a).
  }

  async issueDocument(
    _service: SupabaseClient,
    _input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    throw new InvoicingProviderError(
      "Invoice4U issues the document with the payment; standalone issuance is not supported. " +
        "Use bundled invoice4u/invoice4u for enrolment " +
        "(see docs/plans/finance/invoice4u/00-overview.md).",
      { retryable: false },
    );
  }
}

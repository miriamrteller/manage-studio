import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  InvoicingProviderError,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * iCount invoicing adapter — stub.
 *
 * Bundled iCount issues the tax document with the payment (Option A′), so standalone
 * `issueDocument` is not supported — same pattern as GrowInvoicingProvider.
 */
export class IcountInvoicingProvider implements InvoicingProvider {
  readonly slug = "icount";

  async authenticate(_service: SupabaseClient, _tenantId: string): Promise<void> {
    // Bundled path — document arrives via IPN / document webhook (I2a+).
  }

  async issueDocument(
    _service: SupabaseClient,
    _input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    throw new InvoicingProviderError(
      "iCount issues the document with the payment; standalone issuance is not supported. " +
        "Use bundled icount/icount for enrolment (see docs/plans/finance/icount/RUNBOOK.md).",
      { retryable: false },
    );
  }
}

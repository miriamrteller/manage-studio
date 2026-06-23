import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  InvoicingProviderError,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * Grow (Meshulam) invoicing adapter — stub.
 *
 * Grow issues the tax document together with the payment (bundled), so there is no
 * standalone document API for the cash/manual path. `issueDocument` therefore throws a
 * non-retryable error pointing at the runbook; the real bundled handling lands in Stage G4.
 */
export class GrowInvoicingProvider implements InvoicingProvider {
  readonly slug = "grow";

  async authenticate(_service: SupabaseClient, _tenantId: string): Promise<void> {
    // No-op — Grow auth is validated at charge time (Stage G4).
  }

  async issueDocument(
    _service: SupabaseClient,
    _input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    throw new InvoicingProviderError(
      "Grow issues the document with the payment; standalone issuance is not supported. " +
        "Keep invoicing_provider=mock for cash/manual QA until the API is confirmed " +
        "(see docs/plans/finance/GROW-RUNBOOK.md).",
      { retryable: false },
    );
  }
}

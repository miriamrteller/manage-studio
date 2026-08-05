import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  InvoicingProviderError,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * YPay invoicing adapter — stub.
 *
 * YPay issues the tax document together with the payment (docType on /payment; the
 * document arrives via the payment notifyUrl callback). Standalone issuance via the
 * separate /document endpoint is not wired for the enrolment path.
 */
export class YpayInvoicingProvider implements InvoicingProvider {
  readonly slug = "ypay";

  async authenticate(_service: SupabaseClient, _tenantId: string): Promise<void> {
    // Bundled path — document arrives via the payment callback.
  }

  async issueDocument(
    _service: SupabaseClient,
    _input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    throw new InvoicingProviderError(
      "YPay issues the document with the payment; standalone issuance is not supported. " +
        "Use bundled ypay/ypay for enrolment.",
      { retryable: false },
    );
  }
}

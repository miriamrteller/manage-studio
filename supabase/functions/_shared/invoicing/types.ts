import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { IssuedDocumentKind } from "../payments/document-kind.ts";

export type DocumentKind = "sale" | "refund";

export interface CanonicalDocumentInput {
  tenantId: string;
  paymentId: string;
  documentKind: DocumentKind;
  language: "he" | "en";
  currency: string;
  pretaxAmountMinor: number;
  vatAmountMinor: number;
  totalAmountMinor: number;
  vatRate: number;
  payer: { name: string; email?: string };
  buyer?: { businessTaxId?: string; businessName?: string };
  originalExternalDocumentId?: string;
  /**
   * How the money was received (payments.payment_method). Standalone issuers
   * that document offline money (YPay /document) need it; bundled providers
   * ignore it because the charge itself carries the method.
   */
  paymentMethod?: "card" | "cash" | "bank_transfer" | "bit" | "other" | null;
  /** When the money was received (payments.paid_at); the document is dated by it. */
  paidAt?: string | null;
  /** Free-text line description (payments.description), e.g. "Deposit — manual bank_transfer". */
  description?: string | null;
}

export interface ExternalDocumentResult {
  externalDocumentId: string;
  externalDocumentNumber: string;
  documentUrl: string;
  /** Which document the provider issued, when we know it (payments.issued_document_kind). */
  documentKind?: IssuedDocumentKind | null;
}

export interface AuthHealthResult {
  valid: boolean;
  validUntil?: string;
  message?: string;
}

export interface InvoicingProvider {
  readonly slug: string;
  authenticate(service: SupabaseClient, tenantId: string): Promise<void>;
  issueDocument(
    service: SupabaseClient,
    input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult>;
  checkAuthHealth?(
    service: SupabaseClient,
    tenantId: string,
  ): Promise<AuthHealthResult>;
}

export class InvoicingProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable: boolean }) {
    super(message);
    this.name = "InvoicingProviderError";
    this.retryable = options.retryable;
  }
}

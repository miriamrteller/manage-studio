import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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
}

export interface ExternalDocumentResult {
  externalDocumentId: string;
  externalDocumentNumber: string;
  documentUrl: string;
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

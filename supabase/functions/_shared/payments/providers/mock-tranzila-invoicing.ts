/**
 * mock-tranzila-invoicing.ts — MockTranzilaInvoicingAdapter
 * Test double for TranzilaInvoicingAdapter.
 * Activated by TRANZILA_MOCK=true env var in the providerForInvoicing() factory.
 *
 * Note: Phase 2 stubs (createITAAllocation, sendInvoiceSMS, getVATReport) and
 * non-applicable stubs (captureJ5, addTokenSession) still throw as in the real adapter.
 */

import type {
  IInvoicingProvider,
  InvoiceData,
  InvoiceResponse,
  AllocationResponse,
  J5Params,
  ChargeResponse,
  VATReport,
  TokenSessionResponse,
} from "./types.ts";

export class MockTranzilaInvoicingAdapter implements IInvoicingProvider {
  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    const id = `mock-doc-${Date.now()}`;
    return {
      docnum:             id,
      lawNumber:          `mock-key-${Date.now()}`,
      pdfUrl:             `invoices/mock-tenant/${id}.pdf`,
      status:             "paid",
      allocationRequired: false,
      createdAt:          new Date().toISOString(),
    };
  }

  createITAAllocation(_docnum: string): Promise<AllocationResponse> {
    throw new Error(
      "NotImplementedError: SHAAM integration pending — Phase 2.",
    );
  }

  captureJ5(_tokenId: string, _params: J5Params): Promise<ChargeResponse> {
    throw new Error(
      "NotImplementedError: J5 not applicable to Tranzila — use createSTO() via IPaymentProvider.",
    );
  }

  sendInvoiceSMS(_docnum: string, _phone: string): Promise<void> {
    throw new Error(
      "NotImplementedError: SMS endpoint not available via Tranzila Invoices API.",
    );
  }

  getVATReport(_month: string, _tenantId: string): Promise<VATReport> {
    throw new Error(
      "NotImplementedError: VAT report not available via Tranzila Invoices API.",
    );
  }

  addTokenSession(_clientId: string): Promise<TokenSessionResponse> {
    throw new Error(
      "NotImplementedError: Token session handled by Tranzila Hosted Fields — no server-side session required.",
    );
  }
}

/**
 * MockYeshAdapter — test double for YeshInvoiceAdapter.
 * Returns predictable success responses. Use YESH_MOCK=true env var.
 */

import type {
  AllocationResponse,
  ChargeResponse,
  IInvoicingProvider,
  InvoiceData,
  InvoiceResponse,
  J5Params,
  TokenSessionResponse,
  VATReport,
} from "./invoicing-types.ts";

export class MockYeshAdapter implements IInvoicingProvider {
  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    const docnum = `MOCK-DOC-${Date.now()}`;
    return {
      docnum,
      lawNumber: `MOCK-LAW-${Date.now()}`,
      pdfUrl: `https://mock.yesh.test/documents/${docnum}.pdf`,
      status: "sent",
      allocationRequired: data.b2bFlag,
      createdAt: new Date().toISOString(),
    };
  }

  async createITAAllocation(docnum: string): Promise<AllocationResponse> {
    return {
      allocationNumber: `MOCK-ALLOC-${Date.now()}`,
      status: "obtained",
      shaamReference: `MOCK-SHAAM-${Date.now()}`,
    };
  }

  async captureJ5(tokenId: string, params: J5Params): Promise<ChargeResponse> {
    return {
      transactionId: `mock_j5_${crypto.randomUUID()}`,
      status: "success",
      amount: params.amount,
      currency: params.currency,
      processedAt: new Date().toISOString(),
    };
  }

  async sendInvoiceSMS(_docnum: string, _phone: string): Promise<void> {
    // no-op in mock
  }

  async getVATReport(month: string, tenantId: string): Promise<VATReport> {
    return {
      month,
      tenantId,
      totalSales: "10000.00",
      totalVAT: "1700.00",
      invoiceCount: 5,
      generatedAt: new Date().toISOString(),
    };
  }

  async addTokenSession(_clientId: string): Promise<TokenSessionResponse> {
    return {
      requestToken: `mock_rt_${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }
}

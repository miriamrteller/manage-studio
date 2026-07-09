/**
 * mock-yesh.ts — MockYeshInvoiceAdapter
 *
 * Test double for YeshInvoiceAdapter.
 * Activated by YESH_MOCK=true in env.
 * All methods return predictable values for the 34 TDD tests.
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
} from './types.ts';
import { InvoicingProviderError } from './types.ts';

export class MockYeshInvoiceAdapter implements IInvoicingProvider {
  private static _counter = 0;
  // Injectable overrides for specific test scenarios
  public simulateShaamUnavailable = false;
  public simulateB2cFlag          = false;
  public simulateCredentialError  = false;
  public simulateAllocationNull   = false;   // returns null with not_required
  public simulateSmsFailure       = false;
  public allocationNumberToReturn: string | null = 'ALLOC-TEST-001';
  public requestTokenToReturn     = 'mock-request-token-xyz';

  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    if (this.simulateCredentialError) {
      throw new InvoicingProviderError(
        'INVOICING_CREDENTIAL_ERROR: Yesh API key invalid or expired',
        'INVOICING_CREDENTIAL_ERROR',
        401
      );
    }

    const docnum = `DOC-${++MockYeshInvoiceAdapter._counter}-${Date.now()}`;
    return {
      docnum,
      lawNumber:          `LAW-${Date.now()}`,
      pdfUrl:             `https://yeshinvoice.co.il/docs/${docnum}.pdf`,
      status:             'sent',
      allocationRequired: data.b2bFlag,
      createdAt:          new Date().toISOString(),
    };
  }

  async createITAAllocation(docnum: string): Promise<AllocationResponse> {
    if (this.simulateShaamUnavailable) {
      return {
        allocationNumber: null,
        status:           'error',
        skipReason:       'shaam_unavailable',
      };
    }

    if (this.simulateAllocationNull) {
      return {
        allocationNumber: null,
        status:           'not_required',
        skipReason:       'amount_below_threshold',
      };
    }

    return {
      allocationNumber: this.allocationNumberToReturn,
      status:           this.allocationNumberToReturn ? 'obtained' : 'not_required',
      skipReason:       this.allocationNumberToReturn ? undefined : 'amount_below_threshold',
      shaamReference:   `SHAAM-REF-${docnum}`,
    };
  }

  async captureJ5(_tokenId: string, params: J5Params): Promise<ChargeResponse> {
    return {
      transactionId: `J5-TXN-${Date.now()}`,
      status:        'success',
      amount:        params.amount,
      currency:      params.currency,
      processedAt:   new Date().toISOString(),
    };
  }

  async sendInvoiceSMS(_docnum: string, _phone: string): Promise<void> {
    if (this.simulateSmsFailure) {
      throw new InvoicingProviderError('SMS delivery failed', 'YESH_SMS_FAILED', 500);
    }
    // Success: no-op
  }

  async getVATReport(month: string, tenantId: string): Promise<VATReport> {
    return {
      month,
      tenantId,
      totalSales:   '15000.00',
      totalVAT:     '2550.00',
      invoiceCount: 8,
      generatedAt:  new Date().toISOString(),
      reportUrl:    `https://yeshinvoice.co.il/reports/vat-${month}.pdf`,
    };
  }

  async addTokenSession(_clientId: string): Promise<TokenSessionResponse> {
    return {
      requestToken: this.requestTokenToReturn,
      expiresAt:    new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }
}

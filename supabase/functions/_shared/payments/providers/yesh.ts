/**
 * yesh.ts — YeshInvoiceAdapter
 *
 * Implements IInvoicingProvider for Yesh Invoice (https://yeshinvoice.co.il).
 * Tax Delegation Doctrine: OpalSwift NEVER computes VAT, thresholds, or eligibility.
 * PCI SAQ A: addTokenSession() is the ONLY card-related server call — no raw card data.
 *
 * ⚠️ Day-1 tasks before production use:
 *   F-03  — Confirm auth header: Authorization vs X-API-Key (test both, use the one that returns 200)
 *   F-13  — Confirm endpoint paths: /documents vs /documents/create; /documents/{docnum}/allocation vs /israelinvoices/create-allocation
 *   A-01  — Confirm generateRequestToken exact request + response schema from sandbox
 *   A-02  — Locate Yesh JS plugin embed instructions ("Credit card plugins" in Yesh API Dictionary)
 */

import type {
  IInvoicingProvider,
  InvoiceData,
  InvoiceResponse,
  AllocationResponse,
  AllocationSkipReason,
  J5Params,
  ChargeResponse,
  VATReport,
  TokenSessionResponse,
  YeshConfig,
  YeshCreateDocumentRequest,
  YeshCreateDocumentResponse,
  YeshAllocationResponse,
  YeshGenerateRequestTokenResponse,
} from './types.ts';
import { InvoicingProviderError, AuthenticationError } from './types.ts';

const YESH_BASE_URL = 'https://api.yeshinvoice.co.il/api/v1.1';

// Currency code mapping: ISO → Yesh integer
const CURRENCY_MAP: Record<string, number> = {
  ILS: 1,
  USD: 2,
  EUR: 3,
};

// Language mapping
const LANG_MAP: Record<string, number> = {
  he: 1,
  en: 2,
};

/**
 * Maps Yesh allocation status string → AllocationSkipReason for storage.
 * OpalSwift stores Yesh's reason, never computes one from invoice data.
 */
function mapAllocationSkipReason(yeshStatus: string): AllocationSkipReason {
  switch (yeshStatus) {
    case 'not_required': return 'amount_below_threshold';  // Yesh determined below threshold
    case 'rejected':     return 'rejected';
    default:             return 'not_required';
  }
}

export class YeshInvoiceAdapter implements IInvoicingProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;    // resolved from vault at instantiation

  constructor(private readonly config: YeshConfig & { resolvedApiKey: string }) {
    this.baseUrl = YESH_BASE_URL;
    this.apiKey  = config.resolvedApiKey;
  }

  /** Authorization header for all Yesh requests.
   *  ⚠️ Day-1: confirm if Yesh uses 'Authorization: <key>' or 'Authorization: Bearer <key>'
   *  This implementation uses bare key (no Bearer prefix) per Hebrew guide. */
  private get authHeader(): Record<string, string> {
    return {
      'Authorization': this.apiKey,  // ⚠️ Day-1 F-03: confirm exact format
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: this.authHeader,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      throw new AuthenticationError(
        `Yesh authentication failed — verify API key (tenant config api_key_ref). Status: ${response.status}`,
        'yesh'
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new InvoicingProviderError(
        `Yesh returned non-JSON response (status ${response.status})`,
        'YESH_MALFORMED_RESPONSE',
        response.status
      );
    }

    const parsed = data as Record<string, unknown>;
    if (!response.ok || parsed['success'] === false) {
      throw new InvoicingProviderError(
        String(parsed['error'] ?? 'Yesh API error'),
        String(parsed['errorCode'] ?? 'YESH_API_ERROR'),
        response.status,
        data
      );
    }

    return data as T;
  }

  /**
   * Creates an ITA-compliant invoice via Yesh.
   * OpalSwift passes data; Yesh handles document type, VAT, and sequencing.
   * ⚠️ Day-1 F-13: confirm path (/documents vs /documents/create)
   * ⚠️ Day-1: confirm valid document type codes (do not hardcode 305/320 — unverified)
   */
  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    const body: YeshCreateDocumentRequest = {
      type: data.b2bFlag ? 305 : 400,  // ⚠️ Day-1: confirm actual type codes from Yesh sandbox
      client: {
        name:  data.clientName,
        phone: data.clientPhone,
        email: data.clientEmail,
      },
      currency: CURRENCY_MAP[data.currency] ?? 1,
      lang:     LANG_MAP[data.language ?? 'he'],
      items: data.lineItems.map(item => ({
        catalog:     item.description,
        description: item.description,
        quantity:    item.quantity,
        price:       item.unitPrice,
        total:       item.totalPrice,
        vat:         item.vatRate,
      })),
      dueDate: data.dueDate,
    };

    // ⚠️ Day-1 F-13: switch path after confirming with sandbox
    const resp = await this.request<YeshCreateDocumentResponse>('POST', '/documents', body);

    return {
      docnum:             resp.docnum,
      lawNumber:          resp.lawNumber,
      pdfUrl:             resp.pdfLink,
      status:             'sent',
      allocationRequired: data.b2bFlag,
      createdAt:          new Date().toISOString(),
    };
  }

  /**
   * Requests ITA allocation number from Yesh (which calls SHAAM).
   * Called for ALL B2B invoices — Yesh decides eligibility.
   * OpalSwift NEVER evaluates thresholds.
   * ⚠️ Day-1 F-13: confirm path (/documents/{docnum}/allocation vs /israelinvoices/create-allocation)
   * T-33: idempotency key = docnum; prevents duplicate SHAAM calls on concurrent requests.
   */
  async createITAAllocation(docnum: string): Promise<AllocationResponse> {
    try {
      const resp = await this.request<YeshAllocationResponse>(
        'POST',
        `/documents/${docnum}/allocation`,  // ⚠️ Day-1 F-13: confirm path
        { docnum }
      );

      if (resp.allocationNumber) {
        return {
          allocationNumber: resp.allocationNumber,
          status:           'obtained',
          shaamReference:   resp.shaamReference,
        };
      }

      // Yesh returned null — store reason for audit (HITL-PA-01: Miriam chose Option B)
      return {
        allocationNumber: null,
        status:           'not_required',
        skipReason:       mapAllocationSkipReason(resp.status),
        shaamReference:   resp.shaamReference,
      };
    } catch (err) {
      if (err instanceof InvoicingProviderError && (
        err.httpStatus === 503 || err.code === 'SHAAM_UNAVAILABLE'
      )) {
        return {
          allocationNumber: null,
          status:           'error',
          skipReason:       'shaam_unavailable',
        };
      }
      throw err;
    }
  }

  /**
   * Captures a J5 instalment payment via Yesh token.
   * J5 = Israeli instalment billing standard.
   */
  async captureJ5(tokenId: string, params: J5Params): Promise<ChargeResponse> {
    const resp = await this.request<{
      success: boolean;
      transactionId?: string;
      j5Reference?: string;
      status?: string;
      error?: string;
      errorCode?: number;
    }>('POST', '/tokens/captureJ5', {
      tokenId,
      amount:      Number(params.amount),
      currency:    CURRENCY_MAP[params.currency] ?? 1,
      description: params.description,
      j5Data:      { clientReference: params.clientReference },
    });

    if (!resp.success || !resp.transactionId) {
      throw new InvoicingProviderError(
        resp.error ?? 'J5 capture failed',
        'J5_CAPTURE_FAILED',
        500,
        resp
      );
    }

    return {
      transactionId: resp.transactionId,
      status:        'success',
      amount:        params.amount,
      currency:      params.currency,
      processedAt:   new Date().toISOString(),
    };
  }

  /**
   * Sends invoice link to client via SMS.
   * Phone must be in Israeli format: +972XXXXXXXXX
   */
  async sendInvoiceSMS(docnum: string, phone: string): Promise<void> {
    await this.request<{ success: boolean; messageId?: string }>(
      'POST',
      '/sms/send',
      { docnum, phone } satisfies { docnum: string; phone: string }
    );
  }

  /**
   * Returns monthly VAT report from Yesh.
   * OpalSwift NEVER computes VAT — this is Yesh's data.
   */
  async getVATReport(month: string, tenantId: string): Promise<VATReport> {
    const resp = await this.request<{
      success: boolean;
      report?: {
        month: string;
        totalSales: number;
        totalVAT: number;
        invoiceCount: number;
        reportUrl?: string;
      };
    }>('GET', `/reports/vat?month=${month}&format=json`);

    if (!resp.report) {
      throw new InvoicingProviderError(
        `No VAT report available for ${month}`,
        'YESH_DOCUMENT_NOT_FOUND',
        404
      );
    }

    return {
      month:        resp.report.month,
      tenantId,
      totalSales:   String(resp.report.totalSales),
      totalVAT:     String(resp.report.totalVAT),
      invoiceCount: resp.report.invoiceCount,
      generatedAt:  new Date().toISOString(),
      reportUrl:    resp.report.reportUrl,
    };
  }

  /**
   * PCI SAQ A Step 1: obtain short-lived requestToken from Yesh.
   * Token is passed to client browser → Yesh JS plugin collects card data client-side.
   * Raw card data NEVER enters OpalSwift's server.
   * ⚠️ Day-1 A-01: call POST /api/v1.1/tokens/generateRequestToken in sandbox to confirm schema.
   */
  async addTokenSession(clientId: string): Promise<TokenSessionResponse> {
    const resp = await this.request<YeshGenerateRequestTokenResponse>(
      'POST',
      '/tokens/generateRequestToken',
      { clientId }
    );

    if (!resp.success || !resp.requestToken) {
      throw new InvoicingProviderError(
        resp.error ?? 'Failed to generate token session',
        'YESH_TOKEN_SESSION_FAILED',
        500,
        resp
      );
    }

    return {
      requestToken: resp.requestToken,
      expiresAt:    resp.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }
}

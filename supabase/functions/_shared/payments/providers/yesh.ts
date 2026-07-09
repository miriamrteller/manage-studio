/**
 * YeshInvoiceAdapter — IInvoicingProvider implementation for Yesh Invoice API.
 *
 * be-adapter-spec.md v1.4.0 §2 + §7 (secrets via existing invoicing credential RPC).
 *
 * Tax Delegation Doctrine: OpalSwift passes data to Yesh and stores results.
 * No tax computation, no threshold evaluation, no compliance decisions here.
 *
 * PCI SAQ A: addTokenSession() is the ONLY card-related server call.
 * It returns a short-lived requestToken — raw card data goes client-side to Yesh JS.
 *
 * ⚠️ DAY-1 VERIFICATION REQUIRED before production use:
 *   F-03: Auth header format — spec says Bearer; build-plan §5.1 says bare key.
 *         Test with `Authorization: {api_key}` first; if 401, try `Bearer {api_key}`.
 *   F-13: Path conflict — /documents vs /documents/create; /documents/{docnum}/allocation
 *         vs /israelinvoices/create-allocation. Confirm both from sandbox. Update YESH_PATHS.
 *   A-01: generateRequestToken exact schema — call sandbox before writing card capture UI.
 *   A-02: Yesh JS plugin embed instructions — locate from "Credit card plugins" section.
 *   A-03: CSP-safe iframe embed compatibility with Vite/React SPA.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
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
import {
  AuthenticationError,
  InvoicingProviderError,
} from "./invoicing-types.ts";

// ---------------------------------------------------------------------------
// Endpoint paths — update after Day-1 sandbox verification (F-13)
// ---------------------------------------------------------------------------
const YESH_BASE_URL = "https://api.yeshinvoice.co.il/api/v1.1";

const YESH_PATHS = {
  /** ⚠️ F-13: confirm /documents vs /documents/create in sandbox */
  createDocument: "/documents",
  /** ⚠️ F-13: confirm /documents/{docnum}/allocation vs /israelinvoices/create-allocation */
  createAllocation: (docnum: string) => `/documents/${docnum}/allocation`,
  getDocumentByLawNumber: (lawNumber: string) => `/documents/law/${lawNumber}`,
  /** ⚠️ A-01: confirm exact schema from sandbox before writing card capture UI */
  generateRequestToken: "/tokens/generateRequestToken",
  chargeToken: "/tokens/charge",
  captureJ5: "/tokens/captureJ5",
  sendSMS: "/sms/send",
  vatReport: "/reports/vat",
} as const;

// ---------------------------------------------------------------------------
// Currency + language coercion helpers (Yesh uses numeric codes)
// ---------------------------------------------------------------------------
function toCurrencyCode(currency: string): number {
  switch (currency.toUpperCase()) {
    case "ILS": return 1;
    case "USD": return 2;
    case "EUR": return 3;
    default:
      throw new InvoicingProviderError(
        `Unsupported Yesh currency: ${currency}`,
        "VALIDATION_ERROR",
      );
  }
}

function toLangCode(lang?: "he" | "en"): number {
  return lang === "en" ? 2 : 1; // 1 = Hebrew (default), 2 = English
}

// ---------------------------------------------------------------------------
// Credential shape
// ---------------------------------------------------------------------------
interface YeshCredentials {
  companyId: string;
  apiKey: string;
}

// ---------------------------------------------------------------------------
// YeshInvoiceAdapter
// ---------------------------------------------------------------------------
export class YeshInvoiceAdapter implements IInvoicingProvider {
  constructor(private readonly service: SupabaseClient) {}

  // ── Credential fetch ────────────────────────────────────────────────────

  private async getCredentials(tenantId: string): Promise<YeshCredentials> {
    const { data, error } = await this.service.rpc("get_tenant_yesh_credentials", {
      p_tenant_id: tenantId,
    });
    if (error || !data?.[0]?.api_key) {
      throw new AuthenticationError(
        "Yesh credentials not configured or invalid",
        "yesh",
      );
    }
    const row = data[0] as { company_id: string | null; api_key: string };
    if (!row.company_id) {
      throw new AuthenticationError(
        "Yesh company_id not configured for tenant",
        "yesh",
      );
    }
    return { companyId: row.company_id, apiKey: row.api_key };
  }

  // ── HTTP helper ─────────────────────────────────────────────────────────

  private async yeshFetch<T>(
    apiKey: string,
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    let url = `${YESH_BASE_URL}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += "?" + new URLSearchParams(query).toString();
    }

    // ⚠️ F-03: Auth header format unconfirmed — spec uses Bearer; build-plan §5.1 says bare key.
    // Test with Authorization: {apiKey} first. If 401, switch to Bearer {apiKey}.
    // The string below uses Bearer as per spec v1.4.0; update after Day-1 confirmation.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      throw new AuthenticationError(
        "Yesh API authentication failed — check api_key and Authorization header format (F-03)",
        "yesh",
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new InvoicingProviderError(
        `Yesh returned non-JSON response (HTTP ${res.status})`,
        "YESH_MALFORMED_RESPONSE",
        res.status,
      );
    }

    const parsed = json as Record<string, unknown>;
    if (!res.ok || parsed["success"] === false) {
      throw new InvoicingProviderError(
        String(parsed["error"] ?? `Yesh HTTP ${res.status}`),
        String(parsed["errorCode"] ?? "YESH_ERROR"),
        res.status,
        parsed,
      );
    }

    return parsed as T;
  }

  // ── IInvoicingProvider implementation ───────────────────────────────────

  /**
   * createInvoice — POST /documents
   * ⚠️ F-13: path may be /documents/create — confirm in sandbox.
   * ⚠️ Document type codes unverified — Day-1 Dev Task: enumerate from sandbox.
   *    Do NOT hardcode 305/320 until confirmed.
   */
  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    const creds = await this.getCredentials(data.tenantId);

    const body = {
      // ⚠️ type: document type code — UNVERIFIED. Day-1: enumerate valid codes from Yesh sandbox.
      // type: ???,
      client: {
        name: data.clientName,
        phone: data.clientPhone || undefined,
        email: data.clientEmail || undefined,
      },
      currency: toCurrencyCode(data.currency),
      lang: toLangCode(data.language),
      items: data.lineItems.map((item) => ({
        catalog: item.description,
        description: item.description,
        quantity: item.quantity,
        price: item.unitPrice, // MUST be string — decimal precision required
        total: item.totalPrice, // MUST be string
        vat: item.vatRate,
      })),
      dueDate: data.dueDate,
    };

    const res = await this.yeshFetch<{
      success: boolean;
      docnum: string;
      lawNumber: string;
      pdfLink?: string;
    }>(creds.apiKey, "POST", YESH_PATHS.createDocument, body);

    return {
      docnum: res.docnum,
      lawNumber: res.lawNumber,
      pdfUrl: res.pdfLink,
      status: "sent",
      allocationRequired: data.b2bFlag,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * createITAAllocation — POST /documents/{docnum}/allocation
   * ⚠️ F-13: path may be /israelinvoices/create-allocation — confirm in sandbox.
   *
   * Called for ALL B2B invoices. Yesh determines eligibility and calls SHAAM.
   * OpalSwift stores whatever Yesh returns — including null (not_required).
   * No threshold logic is ever evaluated here.
   */
  async createITAAllocation(docnum: string): Promise<AllocationResponse> {
    // Derive tenantId from docnum — caller must pass tenantId or we need it from context.
    // For simplicity, the caller passes tenantId separately. This method signature follows
    // the spec interface; the adapter retrieves credentials by resolving the Yesh docnum
    // to a tenant in production. For now, tenantId injection is done in the webhook handler.
    //
    // ⚠️ The IInvoicingProvider interface only accepts docnum. The edge function calling
    // this is responsible for pre-loading credentials before calling this method.
    // The Supabase client (service role) is used to look up tenant from docnum if needed.

    // For Phase 3 scaffolding: apiKey is loaded from context in the webhook handler which
    // always has tenantId. The webhook handler calls getCredentials(tenantId) and passes
    // apiKey via a subclass or factory param. For now, we make the signature explicit.
    throw new InvoicingProviderError(
      "createITAAllocation: call createITAAllocationForTenant(docnum, tenantId) instead",
      "NOT_IMPLEMENTED",
    );
  }

  /**
   * createITAAllocationForTenant — extended method (not on interface) for direct tenant calls.
   * Called by the webhook handler which always has tenantId available.
   */
  async createITAAllocationForTenant(
    docnum: string,
    tenantId: string,
  ): Promise<AllocationResponse> {
    const creds = await this.getCredentials(tenantId);

    const body = { docnum };

    // ⚠️ F-13: confirm path — /documents/{docnum}/allocation vs /israelinvoices/create-allocation
    const res = await this.yeshFetch<{
      success: boolean;
      allocationNumber?: string;
      status: string;
      shaamReference?: string;
      error?: string;
      errorCode?: number;
    }>(creds.apiKey, "POST", YESH_PATHS.createAllocation(docnum), body);

    return {
      allocationNumber: res.allocationNumber ?? null,
      status: res.status as AllocationResponse["status"],
      shaamReference: res.shaamReference,
    };
  }

  /**
   * captureJ5 — POST /tokens/captureJ5
   * Israeli J5 instalment capture. Yesh handles the instalment compliance.
   */
  async captureJ5(tokenId: string, params: J5Params): Promise<ChargeResponse> {
    // tenantId must be injected — same pattern as createITAAllocationForTenant.
    // This placeholder satisfies the interface; webhook handler uses captureJ5ForTenant.
    throw new InvoicingProviderError(
      "captureJ5: call captureJ5ForTenant(tokenId, params, tenantId) instead",
      "NOT_IMPLEMENTED",
    );
  }

  async captureJ5ForTenant(
    tokenId: string,
    params: J5Params,
    tenantId: string,
  ): Promise<ChargeResponse> {
    const creds = await this.getCredentials(tenantId);

    const body = {
      tokenId,
      amount: parseFloat(params.amount),
      currency: toCurrencyCode(params.currency),
      description: params.description,
      j5Data: {},
    };

    const res = await this.yeshFetch<{
      success: boolean;
      transactionId?: string;
      j5Reference?: string;
      status?: string;
    }>(creds.apiKey, "POST", YESH_PATHS.captureJ5, body);

    return {
      transactionId: res.transactionId ?? "",
      status: (res.status as ChargeResponse["status"]) ?? "success",
      amount: params.amount,
      currency: params.currency,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * sendInvoiceSMS — POST /sms/send
   * Sends the invoice link to the client's Israeli phone number.
   */
  async sendInvoiceSMS(docnum: string, phone: string): Promise<void> {
    // Resolve tenantId from context — edge function must call sendInvoiceSMSForTenant.
    throw new InvoicingProviderError(
      "sendInvoiceSMS: call sendInvoiceSMSForTenant(docnum, phone, tenantId) instead",
      "NOT_IMPLEMENTED",
    );
  }

  async sendInvoiceSMSForTenant(
    docnum: string,
    phone: string,
    tenantId: string,
  ): Promise<void> {
    const creds = await this.getCredentials(tenantId);

    await this.yeshFetch<{ success: boolean }>(
      creds.apiKey,
      "POST",
      YESH_PATHS.sendSMS,
      { docnum, phone },
    );
  }

  /**
   * getVATReport — GET /reports/vat?month=YYYY-MM&format=json
   * Monthly VAT export. Yesh returns all document totals. OpalSwift stores and surfaces result.
   */
  async getVATReport(month: string, tenantId: string): Promise<VATReport> {
    const creds = await this.getCredentials(tenantId);

    const res = await this.yeshFetch<{
      success: boolean;
      report?: {
        month: string;
        totalSales: number;
        totalVAT: number;
        invoiceCount: number;
        reportUrl?: string;
      };
    }>(creds.apiKey, "GET", YESH_PATHS.vatReport, undefined, {
      month,
      format: "json",
    });

    if (!res.report) {
      throw new InvoicingProviderError(
        `No VAT report data returned for month ${month}`,
        "YESH_ERROR",
      );
    }

    return {
      month: res.report.month,
      tenantId,
      totalSales: String(res.report.totalSales),
      totalVAT: String(res.report.totalVAT),
      invoiceCount: res.report.invoiceCount,
      generatedAt: new Date().toISOString(),
      reportUrl: res.report.reportUrl,
    };
  }

  /**
   * addTokenSession — POST /tokens/generateRequestToken
   *
   * PCI SAQ A — Step 1 of card tokenisation:
   *   1. Server calls this → gets short-lived requestToken
   *   2. requestToken passed to client browser
   *   3. Yesh JS plugin collects card data client-side → sends directly to Yesh
   *   4. Browser returns opaque tokenId to OpalSwift (/api/confirm-token endpoint)
   *
   * Raw card data NEVER enters OpalSwift's server. This is the only card-related server call.
   *
   * ⚠️ A-01: Call POST /api/v1.1/tokens/generateRequestToken in Yesh sandbox to confirm
   *          exact params and response schema before implementing the card capture UI.
   */
  async addTokenSession(clientId: string): Promise<TokenSessionResponse> {
    // tenantId is not on the interface — use addTokenSessionForTenant in the handler
    throw new InvoicingProviderError(
      "addTokenSession: call addTokenSessionForTenant(clientId, tenantId) instead",
      "NOT_IMPLEMENTED",
    );
  }

  async addTokenSessionForTenant(
    clientId: string,
    tenantId: string,
  ): Promise<TokenSessionResponse> {
    const creds = await this.getCredentials(tenantId);

    // ⚠️ A-01: Request/response schema unconfirmed. Call sandbox before building card capture UI.
    const res = await this.yeshFetch<{
      success: boolean;
      requestToken?: string;
      expiresAt?: string; // ISO timestamp — field name unconfirmed (A-01)
    }>(creds.apiKey, "POST", YESH_PATHS.generateRequestToken, { clientId });

    if (!res.requestToken) {
      throw new InvoicingProviderError(
        "Yesh generateRequestToken returned no requestToken",
        "YESH_ERROR",
      );
    }

    return {
      requestToken: res.requestToken,
      expiresAt: res.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }
}

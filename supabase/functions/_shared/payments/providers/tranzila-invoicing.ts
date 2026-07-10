/**
 * tranzila-invoicing.ts — TranzilaInvoicingAdapter
 *
 * Implements IInvoicingProvider for Tranzila Invoices API.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ADAPTER MANDATE
 * NEVER imported directly by edge functions. Use providerForInvoicing() factory.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * TAX DELEGATION DOCTRINE
 *   - vat_percent NEVER passed to Tranzila
 *   - price_type: 'G' on all items (Tranzila uses Bank of Israel rate from terminal config)
 *   - OpalSwift never evaluates ITA thresholds
 *   - allocationRequired: false in Phase 1 (SHAAM/ITA is Phase 2 — createITAAllocation stub)
 *
 * INVOICE CREATION MUST NOT BE RETRIED AUTOMATICALLY (spec §4).
 * This adapter uses _requestNoRetry() for all document creation calls.
 *
 * 7-YEAR ITA RETENTION: enforced at DB level via retention_expires_at generated column.
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
import type { SecretResolver } from "./index.ts";
import {
  mapTranzilaError,
  type TranzilaAuthHeaders,
  type TranzilaCreateDocumentRequest,
  type TranzilaCreateDocumentResponse,
  type InvoiceResult,
} from "./tranzila-types.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const TRANZILA_INVOICE_URL = "https://billing5.tranzila.com";
const REQUEST_TIMEOUT_MS   = 5_000;

// ── Config ────────────────────────────────────────────────────────────────────

export interface TranzilaInvoicingConfig {
  tenantId:        string;
  /** Per-tenant terminal name from tenant_settings.tranzila_terminal_name */
  terminalName:    string;
  secretResolver:  SecretResolver;
  /** Supabase client — required for PDF storage + invoice record persistence */
  supabaseClient:  SupabaseLike;
  /** Supabase Storage bucket (default: "invoices") */
  storageBucket?:  string;
}

interface SupabaseLike {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        data: ArrayBuffer,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: unknown }>;
    };
  };
}

// ── Phase-2 stub helper ───────────────────────────────────────────────────────

class NotImplementedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "NotImplementedError";
  }
}

// ── HMAC helpers — duplicated from tranzila.ts (pure, no adapter state dep) ──

function generateNonce(): string {
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateHMAC(
  appKey: string,
  secret: string,
  time: number,
  nonce: string,
): Promise<string> {
  const encoder   = new TextEncoder();
  const keyData   = encoder.encode(secret + String(time) + nonce);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(appKey));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── TranzilaInvoicingAdapter ──────────────────────────────────────────────────

export class TranzilaInvoicingAdapter implements IInvoicingProvider {
  private readonly storageBucket: string;

  constructor(private readonly cfg: TranzilaInvoicingConfig) {
    this.storageBucket = cfg.storageBucket ?? "invoices";
  }

  // ── IInvoicingProvider ────────────────────────────────────────────────────

  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    const headers = await this._buildHeaders();
    const now     = new Date().toISOString().split("T")[0];

    const body: TranzilaCreateDocumentRequest = {
      terminal_name:      this.cfg.terminalName,
      document_type:      "IR",         // Invoice + Receipt (default)
      document_date:      now,
      document_currency_code: "ILS",
      document_language:  data.language === "en" ? "eng" : "heb",
      response_language:  "hebrew",
      action:             1,
      client_name:        data.clientName,
      client_email:       data.clientEmail,
      created_by_system:  "opalswift",
      created_by_user:    data.tenantId,
      items: data.lineItems.map(li => ({
        name:          li.description,
        unit_price:    Number(li.unitPrice),
        price_type:    "G" as const,   // VAT-inclusive — Tax Delegation Doctrine
        type:          "I" as const,
        units_number:  li.quantity,
        currency_code: "ILS" as const,
        // NEVER include: vat_percent
      })),
    };

    // ⚠️ Invoice creation MUST NOT be retried automatically (spec §4 Private Helpers)
    const result = await this._requestNoRetry<TranzilaCreateDocumentResponse>(
      `${TRANZILA_INVOICE_URL}/api/documents_db/create_document`,
      body,
      headers,
    );

    if (result.error_code !== 0 || !result.doc_number || !result.retrieval_key) {
      throw new Error(
        `TRANZILA_INVOICE_ERROR: ${result.error_message ?? `error_code=${result.error_code}`}`,
      );
    }

    // Download PDF immediately — retrieval_key has an ephemeral TTL (D4)
    let pdfStoragePath: string | undefined;
    if (result.pdf_url) {
      pdfStoragePath = await this._downloadAndStorePDF(result.pdf_url, result.doc_number);
    }

    // Persist invoice record (7-year retention enforced by DB trigger)
    await this.cfg.supabaseClient.from("tenant_invoices").insert({
      tenant_id:        this.cfg.tenantId,
      doc_number:       result.doc_number,
      retrieval_key:    result.retrieval_key,
      pdf_storage_path: pdfStoragePath ?? "",
      client_name:      data.clientName,
      client_id:        undefined,
      amount:           data.lineItems.reduce(
        (sum, li) => sum + Number(li.totalPrice), 0,
      ).toFixed(2),
      currency_code:    "ILS",
      issue_date:       result.created_at?.split("T")[0] ?? now,
      doc_type:         "IR",
      txnindex:         result.txnindex,
      created_by_user:  data.tenantId,
    });

    return {
      docnum:             result.doc_number,
      lawNumber:          result.retrieval_key,
      pdfUrl:             pdfStoragePath ?? result.pdf_url,
      status:             "paid",
      // allocationRequired: false in Phase 1 — createITAAllocation is Phase 2 stub.
      // OpalSwift never evaluates ITA thresholds (Tax Delegation Doctrine).
      allocationRequired: false,
      createdAt:          result.created_at ?? new Date().toISOString(),
    };
  }

  /** Phase 2 stub — SHAAM integration pending. */
  createITAAllocation(_docnum: string): Promise<AllocationResponse> {
    throw new NotImplementedError(
      "SHAAM integration pending — Phase 2. Tranzila support must confirm whether " +
      "platform handles ITA allocation natively before this can be implemented.",
    );
  }

  /** Not applicable — Tranzila uses STO v2 for recurring billing. */
  captureJ5(_tokenId: string, _params: J5Params): Promise<ChargeResponse> {
    throw new NotImplementedError(
      "J5 direct charge not applicable to Tranzila provider — Tranzila uses STO v2 for " +
      "recurring billing. Use createSTO() via IPaymentProvider instead.",
    );
  }

  /** Phase 2 stub — Tranzila Invoices API does not expose SMS endpoint in public docs. */
  sendInvoiceSMS(_docnum: string, _phone: string): Promise<void> {
    throw new NotImplementedError(
      "Tranzila Invoices API does not expose an SMS send endpoint in public docs. " +
      "Phase 2: verify with Tranzila support.",
    );
  }

  /** Phase 2 stub — VAT report not available via Tranzila Invoices API. */
  getVATReport(_month: string, _tenantId: string): Promise<VATReport> {
    throw new NotImplementedError(
      "VAT report not available via Tranzila Invoices API. Phase 2: verify availability " +
      "or implement via portal export.",
    );
  }

  /**
   * Not applicable — token session handled by Tranzila Hosted Fields.
   * Tranzila issues pr_link directly to client browser; no server-side session token required.
   */
  addTokenSession(_clientId: string): Promise<TokenSessionResponse> {
    throw new NotImplementedError(
      "Token session for card capture handled by Tranzila Hosted Fields — no server-side " +
      "session token required. Tranzila issues pr_link directly to client browser.",
    );
  }

  /**
   * retrieveInvoice — fetch invoice by retrieval_key from Supabase.
   * Use this when Tranzila pdf_url has expired (T-32).
   */
  async retrieveInvoice(retrievalKey: string): Promise<InvoiceResult> {
    const { data, error } = await this.cfg.supabaseClient
      .from("tenant_invoices")
      .select("*")
      .eq("retrieval_key", retrievalKey)
      .eq("tenant_id", this.cfg.tenantId)
      .single();

    if (error || !data) {
      throw new Error(`TRANZILA_INVOICE_NOT_FOUND: retrieval_key=${retrievalKey}`);
    }

    return {
      doc_number:    data.doc_number,
      pdf_url:       data.pdf_storage_path,
      retrieval_key: data.retrieval_key,
      created_at:    data.created_at,
      txnindex:      data.txnindex,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _buildHeaders(): Promise<TranzilaAuthHeaders> {
    const { tenantId, secretResolver } = this.cfg;
    const appKey    = await secretResolver.resolve(
      `vault:secret/tenants/${tenantId}/tranzila#app_key`,
    );
    const secretKey = await secretResolver.resolve(
      `vault:secret/tenants/${tenantId}/tranzila#secret_key`,
    );
    const time  = Math.floor(Date.now() / 1000);
    const nonce = generateNonce();
    const token = await generateHMAC(appKey, secretKey, time, nonce);
    return {
      "X-tranzila-api-app-key":      appKey,
      "X-tranzila-api-access-token": token,
      "X-tranzila-api-request-time": time.toString(),
      "X-tranzila-api-nonce":        nonce,
    };
  }

  /**
   * HTTP client WITHOUT retry — mandatory for invoice creation.
   * spec §4: "Invoice creation via createInvoice() MUST NOT be retried automatically"
   * Timeout: 5 seconds.
   */
  private async _requestNoRetry<T>(
    url:     string,
    body:    Record<string, unknown>,
    headers: TranzilaAuthHeaders,
  ): Promise<T> {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
      });
      return await res.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async _downloadAndStorePDF(pdfUrl: string, docNumber: string): Promise<string> {
    const res = await fetch(pdfUrl);
    if (!res.ok) {
      throw new Error(`Failed to download Tranzila PDF for doc ${docNumber}: HTTP ${res.status}`);
    }
    const buffer      = await res.arrayBuffer();
    const storagePath = `invoices/${this.cfg.tenantId}/${docNumber}.pdf`;

    const { error } = await this.cfg.supabaseClient.storage
      .from(this.storageBucket)
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

    if (error) {
      throw new Error(`Failed to store PDF for doc ${docNumber}: ${String(error)}`);
    }

    return storagePath;
  }
}

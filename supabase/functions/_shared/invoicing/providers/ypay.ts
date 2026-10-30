import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { getEnv } from "../../edge-runtime/env.ts";
import { getYpayAccessToken, YpayApiError, ypayPost, type YpayCredentials } from "../../payments/ypay/client.ts";
import { getYpayCredentials } from "../../payments/ypay/credentials.ts";
import { YPAY_ERROR } from "../../payments/ypay/errors.ts";
import {
  buildYpayDocumentPayload,
  isOfflinePaymentMethod,
  isRetryableYpayDocumentError,
  isYpayTokenError,
  parseYpayDocumentResponse,
  ypayDocTypeForVatType,
  type YpayDocType,
} from "../../payments/ypay/document.ts";
import {
  InvoicingProviderError,
  type AuthHealthResult,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * YPay invoicing adapter.
 *
 * Card charges: YPay issues the tax document together with the payment (docType
 * on /payment; the document arrives on the notifyUrl callback) — nothing to do
 * here, finalise skips the enqueue when the callback already stored it.
 *
 * Cash / bank transfer (record-job-payment, record-payment): the money never
 * touched YPay, so the document is issued standalone through POST /document
 * ("Document Generator"). docType follows the tenant's VAT status: a VAT-exempt
 * dealer gets a receipt (108), everyone else an invoice-receipt (109). YPay
 * numbers and signs it; the app only stores id / number / URL.
 *
 * Refunds: YPay exposes no credit-note or refund API, so a refund document is
 * a non-retryable failure (admin issues it in the YPay dashboard), as before.
 *
 * YPAY_MOCK=true returns a deterministic mock document without any network.
 */
export class YpayInvoicingProvider implements InvoicingProvider {
  readonly slug = "ypay";

  async authenticate(service: SupabaseClient, tenantId: string): Promise<void> {
    if (ypayMock()) return;
    const credentials = await loadCredentials(service, tenantId);
    await tokenOrThrow(service, tenantId, credentials);
  }

  async issueDocument(
    service: SupabaseClient,
    input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    if (input.documentKind === "refund") {
      throw new InvoicingProviderError(
        "YPay exposes no credit-note API; issue the refund document in the YPay dashboard " +
          "and attach it to the payment.",
        { retryable: false },
      );
    }

    if (!isOfflinePaymentMethod(input.paymentMethod)) {
      throw new InvoicingProviderError(
        "YPay issues the document with the charge for card payments; standalone /document " +
          `is only for cash / bank transfer (payment_method=${input.paymentMethod ?? "null"}).`,
        { retryable: false },
      );
    }

    const tenant = await loadTenantDocumentSettings(service, input.tenantId);
    const docType = ypayDocTypeForVatType(tenant.vatType);

    if (ypayMock()) {
      return mockDocument(input.paymentId, docType);
    }

    const email = input.payer.email?.trim();
    if (!email) {
      throw new InvoicingProviderError(
        "YPay requires the payer's email to issue a document; add an email to the client and requeue.",
        { retryable: false },
      );
    }

    const credentials = await loadCredentials(service, input.tenantId);
    const token = await tokenOrThrow(service, input.tenantId, credentials);

    const lineName = input.language === "he" ? "תשלום" : "Payment";
    const payload = buildYpayDocumentPayload({
      docType,
      paymentId: input.paymentId,
      paymentMethod: input.paymentMethod,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      language: input.language,
      paidAt: input.paidAt,
      contact: {
        name: input.buyer?.businessName?.trim() || input.payer.name,
        email,
        businessId: input.buyer?.businessTaxId ?? null,
      },
      lineName,
      lineDescription: input.description?.trim() || null,
      // We email the client ourselves (branded, audited, works in mock mode).
      mail: false,
    });

    let json: Record<string, unknown>;
    try {
      json = await ypayPost("document", token, payload);
    } catch (error) {
      throw await mapDocumentError(service, input.tenantId, error);
    }

    const parsed = parseYpayDocumentResponse(json);
    if (!parsed) {
      throw new InvoicingProviderError(
        `YPay /document succeeded but returned no document id: ${JSON.stringify(json).slice(0, 300)}`,
        { retryable: false },
      );
    }
    return parsed;
  }

  async checkAuthHealth(service: SupabaseClient, tenantId: string): Promise<AuthHealthResult> {
    try {
      await this.authenticate(service, tenantId);
      return { valid: true, message: ypayMock() ? "YPay mock — always valid" : "YPay credentials accepted." };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : "Auth check failed" };
    }
  }
}

function ypayMock(): boolean {
  return getEnv("YPAY_MOCK") === "true";
}

function mockDocument(paymentId: string, docType: YpayDocType): ExternalDocumentResult {
  const short = paymentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return {
    externalDocumentId: `mock-ypay-doc-${paymentId}`,
    externalDocumentNumber: `YPAY-MOCK-${docType}-${short}`,
    documentUrl: `https://mock.ypay.local/document/${paymentId}`,
  };
}

async function loadCredentials(service: SupabaseClient, tenantId: string): Promise<YpayCredentials> {
  try {
    return await getYpayCredentials(service, tenantId);
  } catch (error) {
    // Missing / unconfigured credentials never fix themselves on retry.
    throw new InvoicingProviderError(error instanceof Error ? error.message : String(error), {
      retryable: false,
    });
  }
}

async function tokenOrThrow(
  service: SupabaseClient,
  tenantId: string,
  credentials: YpayCredentials,
): Promise<string> {
  try {
    return await getYpayAccessToken(service, tenantId, credentials);
  } catch (error) {
    if (error instanceof YpayApiError) {
      // Bad client id/secret is permanent; anything else (2002 token race — 3001 on an
      // older YPay build — 5xx, network) is transient.
      const retryable =
        error.code === YPAY_ERROR.TOKEN_ALREADY_ACTIVE_LEGACY ||
        isRetryableYpayDocumentError({ code: error.code, httpStatus: error.httpStatus });
      throw new InvoicingProviderError(error.message, { retryable });
    }
    throw new InvoicingProviderError(error instanceof Error ? error.message : String(error), {
      retryable: true,
    });
  }
}

async function loadTenantDocumentSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<{ vatType: number | null }> {
  const { data, error } = await service
    .from("tenants")
    .select("vat_type")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    throw new InvoicingProviderError(`Tenant lookup failed: ${error.message}`, { retryable: true });
  }
  if (!data) {
    throw new InvoicingProviderError(`Tenant not found: ${tenantId}`, { retryable: false });
  }
  return { vatType: data.vat_type == null ? null : Number(data.vat_type) };
}

/** Converts a failed /document call into a queue-aware InvoicingProviderError. */
async function mapDocumentError(
  service: SupabaseClient,
  tenantId: string,
  error: unknown,
): Promise<InvoicingProviderError> {
  if (!(error instanceof YpayApiError)) {
    return new InvoicingProviderError(error instanceof Error ? error.message : String(error), {
      retryable: true,
    });
  }

  if (isYpayTokenError(error.code)) {
    // YPay no longer honours the cached token: expire it so the retry mints a fresh one.
    try {
      await service
        .from("payment_provider_token_cache")
        .update({ expires_at: new Date(0).toISOString(), updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("provider", "ypay");
    } catch (cacheError) {
      console.warn("[ypay invoicing] token cache expire failed:", cacheError);
    }
  }

  return new InvoicingProviderError(error.message, {
    retryable: isRetryableYpayDocumentError({ code: error.code, httpStatus: error.httpStatus }),
  });
}

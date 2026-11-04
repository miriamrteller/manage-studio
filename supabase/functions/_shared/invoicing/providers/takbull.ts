import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { documentKindFromTakbullType } from "../../payments/document-kind.ts";
import { TakbullApiError, type TakbullApi, type TakbullDocumentRequest } from "../../payments/takbull/client.ts";
import { TakbullNotConnectedError } from "../../payments/takbull/credentials.ts";
import { takbullApiForTenant } from "../../payments/takbull/index.ts";
import {
  InvoicingProviderError,
  type AuthHealthResult,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * Takbull invoicing adapter (docs/plans/TAKBULL-INTEGRATION.md, PR 5).
 *
 * Card payments through Takbull: Takbull issues the document with the charge (and with a
 * refund made through Takbull), so nothing is queued for them.
 *
 * Money Takbull never saw (cash, bank transfer, Bit recorded by hand, and refunds recorded by
 * hand): a standalone document through DocumentApi/Create
 * (https://api.takbull.co.il/ApiDocs, read 2026-11-04), with the payment in `cashes`,
 * `wireTransfers` or `customPayments`, and `isNegativeDocument` for a refund. The document
 * type is the studio's own setting (tenants.takbull_document_type: 400 receipt / 320 tax
 * invoice-receipt), never switched by business status. Takbull returns the document's number
 * and id but no link. We email the client ourselves (sendToCustomer: false), as for every
 * document of money recorded by hand.
 *
 * TAKBULL_MOCK=true: the in-memory Takbull (takbull/index.ts), no network.
 */

/** Refund documents by the studio's sale document type. [[ACCOUNTANT: confirm]] */
export const TAKBULL_REFUND_DOCUMENT_TYPE: Record<400 | 320, number> = {
  400: 401, // זיכוי קבלה
  320: 330, // חשבונית מס זיכוי
};

type DocumentPaymentMethod = "cash" | "bank_transfer" | "bit";

function isRecordedMethod(method: CanonicalDocumentInput["paymentMethod"]): method is DocumentPaymentMethod {
  return method === "cash" || method === "bank_transfer" || method === "bit";
}

/**
 * Pure: the DocumentApi/Create request for money recorded by hand. Amounts are the gross
 * price as entered, with VAT included (isItemIncludeTax); a receipt (400 / 401) carries no
 * VAT. A receipt says how the money moved: cash, a transfer, or Bit as a custom payment
 * (creationDate is required there). A credit tax invoice (330) carries no payment.
 */
export function buildTakbullDocument(input: {
  documentKind: "sale" | "refund";
  saleDocumentType: 400 | 320;
  paymentId: string;
  paymentMethod: DocumentPaymentMethod;
  totalAmountMinor: number;
  currency: string;
  language: "he" | "en";
  paidAt: string | null;
  customer: { name: string; email?: string; identityNumber?: string };
  lineDescription: string;
}): TakbullDocumentRequest {
  const documentType = input.documentKind === "refund"
    ? TAKBULL_REFUND_DOCUMENT_TYPE[input.saleDocumentType]
    : input.saleDocumentType;
  const amount = Math.abs(input.totalAmountMinor) / 100;
  const isReceipt = documentType === 400 || documentType === 401;
  const carriesPayment = documentType !== 330;
  const paidAt = input.paidAt ?? new Date().toISOString();

  const payments: Pick<TakbullDocumentRequest, "cashes" | "wireTransfers" | "customPayments"> = !carriesPayment
    ? {}
    : input.paymentMethod === "cash"
    ? { cashes: [{ description: input.language === "he" ? "מזומן" : "Cash", amount }] }
    : input.paymentMethod === "bank_transfer"
    ? { wireTransfers: [{ amount }] }
    : { customPayments: [{ methodName: "Bit", amount, creationDate: paidAt, referanceId: input.paymentId }] };

  return {
    documentType,
    invoiceItems: [{
      description: input.lineDescription,
      unitPrice: amount,
      quantity: 1,
      totalPrice: amount,
      isTaxteble: !isReceipt,
    }],
    customerVM: {
      customerFullName: input.customer.name,
      ...(input.customer.email ? { email: input.customer.email } : {}),
      ...(input.customer.identityNumber ? { identityNumber: input.customer.identityNumber } : {}),
    },
    sendToCustomer: false,
    currency: input.currency.toUpperCase(),
    language: input.language,
    isItemIncludeTax: true,
    totalPriceWithTax: amount,
    ...(input.documentKind === "refund" ? { isNegativeDocument: true } : {}),
    ...payments,
  };
}

export class TakbullInvoicingProvider implements InvoicingProvider {
  readonly slug = "takbull";

  constructor(
    private readonly apiFor: (service: SupabaseClient, tenantId: string) => Promise<TakbullApi> = takbullApiForTenant,
  ) {}

  async authenticate(service: SupabaseClient, tenantId: string): Promise<void> {
    await this.api(service, tenantId);
  }

  async issueDocument(service: SupabaseClient, input: CanonicalDocumentInput): Promise<ExternalDocumentResult> {
    if (!isRecordedMethod(input.paymentMethod)) {
      throw new InvoicingProviderError(
        "Takbull issues the document with its own card payments; a standalone Takbull document is only " +
          `for cash, bank transfer or Bit recorded by hand (payment_method=${input.paymentMethod ?? "null"}).`,
        { retryable: false },
      );
    }
    const { data: tenant, error } = await service
      .from("tenants")
      .select("takbull_document_type")
      .eq("id", input.tenantId)
      .maybeSingle();
    if (error) throw new InvoicingProviderError(`Tenant lookup failed: ${error.message}`, { retryable: true });
    const saleDocumentType: 400 | 320 = Number(tenant?.takbull_document_type) === 400 ? 400 : 320;

    const request = buildTakbullDocument({
      documentKind: input.documentKind,
      saleDocumentType,
      paymentId: input.paymentId,
      paymentMethod: input.paymentMethod,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      language: input.language,
      paidAt: input.paidAt ?? null,
      customer: {
        name: input.buyer?.businessName?.trim() || input.payer.name,
        email: input.payer.email?.trim() || undefined,
        identityNumber: input.buyer?.businessTaxId?.trim() || undefined,
      },
      lineDescription: input.description?.trim() ||
        (input.documentKind === "refund"
          ? (input.language === "he" ? "החזר" : "Refund")
          : (input.language === "he" ? "תשלום" : "Payment")),
    });

    const api = await this.api(service, input.tenantId);
    let result;
    try {
      result = await api.createDocument(request);
    } catch (err) {
      if (err instanceof TakbullApiError) {
        throw new InvoicingProviderError(err.message, { retryable: err.details.retryable });
      }
      throw new InvoicingProviderError(err instanceof Error ? err.message : String(err), { retryable: true });
    }

    const number = result.documentVM?.documentNumber ?? result.documentNumber;
    const id = result.documentVM?.uniqId ?? (result.documentVM?.id != null ? String(result.documentVM.id) : String(number));
    return {
      externalDocumentId: id,
      externalDocumentNumber: String(number),
      // The docs give no document link.
      documentUrl: "",
      documentKind: documentKindFromTakbullType(result.documentVM?.documentType ?? request.documentType),
    };
  }

  async checkAuthHealth(service: SupabaseClient, tenantId: string): Promise<AuthHealthResult> {
    try {
      const api = await this.api(service, tenantId);
      await api.getDocumentSettings();
      return { valid: true, message: "Takbull keys accepted." };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : "Auth check failed" };
    }
  }

  private async api(service: SupabaseClient, tenantId: string): Promise<TakbullApi> {
    try {
      return await this.apiFor(service, tenantId);
    } catch (err) {
      // No keys saved never fixes itself on retry.
      if (err instanceof TakbullNotConnectedError) {
        throw new InvoicingProviderError(err.message, { retryable: false });
      }
      throw err;
    }
  }
}

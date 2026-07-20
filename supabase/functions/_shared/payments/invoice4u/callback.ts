import { ChargeMetadataSchema, type ChargeMetadata, type PaymentEvent } from "../types.ts";

/** Invoice4U callback `Data` JSON — values arrive as strings. */
export interface Invoice4uCallbackData {
  Success?: string;
  ErrorMessage?: string;
  OrderIdClientUsage?: string;
  PaymentId?: string;
  Amount?: string;
  CustomerId?: string;
  CardSuffix?: string;
  CardBrandName?: string;
  CardExpirationDate?: string;
  DocCreated?: string;
  DocumentNumber?: string;
  DocumentId?: string;
  CipherText?: string;
  CipherTextOriginal?: string;
}

export interface ParsedInvoice4uCallback {
  event: PaymentEvent;
  orderIdClientUsage: string;
  paymentId: string | null;
  customerId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  document: {
    externalDocumentId: string;
    externalDocumentNumber?: string;
    documentUrl?: string;
  } | null;
}

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** Major units (NIS) → minor (agorot). */
export function minorFromInvoice4uAmount(amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid Invoice4U Amount: ${String(amount)}`);
  }
  return Math.round(n * 100);
}

/** Provisional PDF URL template — U0-live confirms exact host/path (D19). */
export function buildInvoice4uDocumentUrl(cipherText: string, isQa = true): string {
  const host = isQa
    ? "https://newviewqa.invoice4u.co.il"
    : "https://newview.invoice4u.co.il";
  return `${host}/?c=${encodeURIComponent(cipherText)}`;
}

/**
 * Extract `Data` JSON from a form-urlencoded body (`Data=...`) or raw JSON object.
 */
export function extractInvoice4uCallbackData(rawBody: string): Invoice4uCallbackData {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    throw new Error("Invoice4U callback body empty");
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as Invoice4uCallbackData;
  }

  const params = new URLSearchParams(trimmed);
  const dataField = params.get("Data") ?? params.get("data");
  if (!dataField) {
    throw new Error("Invoice4U callback missing Data field");
  }
  return JSON.parse(dataField) as Invoice4uCallbackData;
}

/** Peek OrderIdClientUsage from form/JSON without full validation. */
export function peekInvoice4uOrderId(rawBody: string): string | undefined {
  try {
    const data = extractInvoice4uCallbackData(rawBody);
    const orderId = data.OrderIdClientUsage?.trim();
    return orderId || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse Invoice4U payment callback into a PaymentEvent + document/token extras.
 * Metadata must be supplied from the pending payment row (D15).
 */
export function parseInvoice4uCallback(
  rawBody: string,
  metadata: ChargeMetadata,
): ParsedInvoice4uCallback {
  const data = extractInvoice4uCallbackData(rawBody);
  const orderIdClientUsage = data.OrderIdClientUsage?.trim() ?? "";
  if (!orderIdClientUsage) {
    throw new Error("Invoice4U callback missing OrderIdClientUsage");
  }

  const succeeded = isTruthyFlag(data.Success);
  const paymentId = data.PaymentId?.trim() || null;

  if (succeeded && !paymentId) {
    throw new Error("Invoice4U success callback missing PaymentId");
  }

  const amountMinor =
    data.Amount != null && data.Amount !== ""
      ? minorFromInvoice4uAmount(data.Amount)
      : Number(metadata.total_amount_minor ?? 0);

  const event: PaymentEvent = {
    type: succeeded ? "payment.succeeded" : "payment.failed",
    providerPaymentRef: paymentId ?? orderIdClientUsage,
    metadata: ChargeMetadataSchema.parse(metadata),
    amountMinor,
    currency: "ILS",
    pretaxAmountMinor: Number(metadata.pretax_amount_minor ?? 0),
    vatAmountMinor: Number(metadata.vat_amount_minor ?? 0),
    vatRate: Number(metadata.vat_rate ?? 0),
    offeringId: metadata.offering_id,
    personId: metadata.person_id,
    failureMessage: succeeded ? undefined : (data.ErrorMessage?.trim() || "Payment failed"),
  };

  let document: ParsedInvoice4uCallback["document"] = null;
  if (succeeded && isTruthyFlag(data.DocCreated) && data.DocumentId?.trim()) {
    const cipher = data.CipherTextOriginal?.trim() || data.CipherText?.trim();
    document = {
      externalDocumentId: data.DocumentId.trim(),
      externalDocumentNumber: data.DocumentNumber?.trim() || undefined,
      documentUrl: cipher ? buildInvoice4uDocumentUrl(cipher) : undefined,
    };
  }

  return {
    event,
    orderIdClientUsage,
    paymentId,
    customerId: data.CustomerId?.trim() || null,
    cardBrand: data.CardBrandName?.trim() || null,
    cardLast4: data.CardSuffix?.trim() || null,
    document,
  };
}

/** Build a mock form-urlencoded callback for confirm-mock-payment / unit tests. */
export function buildMockInvoice4uCallbackBody(params: {
  orderIdClientUsage: string;
  paymentId: string;
  amountMinor: number;
  success?: boolean;
  customerId?: string;
  documentId?: string;
  documentNumber?: string;
  cipherText?: string;
  errorMessage?: string;
}): string {
  const success = params.success !== false;
  const data: Invoice4uCallbackData = {
    Success: success ? "True" : "False",
    OrderIdClientUsage: params.orderIdClientUsage,
    PaymentId: params.paymentId,
    Amount: (params.amountMinor / 100).toFixed(2),
    CustomerId: params.customerId ?? "1001",
    CardSuffix: "4242",
    CardBrandName: "Visa",
    ErrorMessage: success ? undefined : (params.errorMessage ?? "Declined"),
  };
  if (success) {
    data.DocCreated = "True";
    data.DocumentId = params.documentId ?? `doc_${params.paymentId}`;
    data.DocumentNumber = params.documentNumber ?? "1001";
    data.CipherText = params.cipherText ?? `cipher_${params.paymentId}`;
  }
  return new URLSearchParams({ Data: JSON.stringify(data) }).toString();
}

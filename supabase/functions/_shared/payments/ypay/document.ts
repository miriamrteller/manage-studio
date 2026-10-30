/**
 * YPay standalone document issuance (API "Document Generator", POST /document).
 *
 * Used for money that did NOT go through YPay's hosted page — cash and bank
 * transfers recorded by the photographer. YPay numbers and signs the document,
 * so the app never self-numbers a tax document (Israeli law requires a certified
 * system to issue it).
 *
 * The helpers here are pure so they can be unit-tested without a network.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ UNVERIFIED MAPPING — read before the first live offline receipt.      │
 * │                                                                        │
 * │ The YPay PDF (ypay.co.il/assets/files/api/ypay_api_documentation.pdf) │
 * │ documents /document as taking an array of "Method" objects (defined   │
 * │ in its "Common Objects" section) that say how the money was received. │
 * │ The field NAMES inside that object could not be read from the build    │
 * │ sandbox (host blocked), so `METHOD_FIELD` and `YPAY_METHOD_TYPE` below  │
 * │ follow the documented structure but are a best effort. YPay answers    │
 * │ responseCode 3013 ("Payment methods missing") when it rejects them;   │
 * │ that lands as a dead document_queue row + admin alert, never as a     │
 * │ wrong document. Fix the constants, redeploy, requeue.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */
import { YPAY_ERROR } from "./errors.ts";

/** docType 108 = receipt (קבלה) — for VAT-exempt dealers (עוסק פטור). */
export const YPAY_DOC_TYPE_RECEIPT = 108;
/** docType 109 = invoice-receipt (חשבונית מס קבלה) — VAT-registered dealers. */
export const YPAY_DOC_TYPE_INVOICE_RECEIPT = 109;

export type YpayDocType = typeof YPAY_DOC_TYPE_RECEIPT | typeof YPAY_DOC_TYPE_INVOICE_RECEIPT;

/** tenants.vat_type: 1 = VAT included, 2 = before VAT, 3 = exempt. */
export const VAT_TYPE_EXEMPT = 3;

/**
 * Which YPay document a payment receipt should be, by the tenant's VAT status.
 * An exempt dealer may not issue a tax invoice, so it gets a plain receipt.
 */
export function ypayDocTypeForVatType(vatType: number | string | null | undefined): YpayDocType {
  return Number(vatType) === VAT_TYPE_EXEMPT ? YPAY_DOC_TYPE_RECEIPT : YPAY_DOC_TYPE_INVOICE_RECEIPT;
}

/** Offline payment methods the app records (payments.payment_method). */
export type OfflinePaymentMethod = "cash" | "bank_transfer";

export function isOfflinePaymentMethod(value: string | null | undefined): value is OfflinePaymentMethod {
  return value === "cash" || value === "bank_transfer";
}

/** Request field that carries the payment-method array. See UNVERIFIED MAPPING above. */
export const METHOD_FIELD = "methods";

/**
 * YPay "Method.type" codes. See UNVERIFIED MAPPING above — these are the
 * conventional Israeli ordering (cash, cheque, card, bank transfer) and must be
 * confirmed against the PDF's "Common Objects → Method" table.
 */
export const YPAY_METHOD_TYPE: Record<OfflinePaymentMethod, number> = {
  cash: 1,
  bank_transfer: 4,
};

export interface YpayDocumentPayloadInput {
  docType: YpayDocType;
  /** payments.id — echoed as the document's external reference for reconciliation. */
  paymentId: string;
  paymentMethod: OfflinePaymentMethod;
  totalAmountMinor: number;
  currency: string;
  language: "he" | "en";
  /** ISO timestamp the money was received; defaults to now. */
  paidAt?: string | null;
  contact: { name: string; email: string; mobile?: string | null; businessId?: string | null };
  lineName: string;
  lineDescription?: string | null;
  /** When true YPay emails the document itself; we send our own branded email instead. */
  mail?: boolean;
}

/** Major units with two decimals, as YPay expects on /payment. */
export function ypayMajorAmount(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

/** YYYY-MM-DD in Israel local time (documents are dated by the day the money arrived). */
export function ypayDocumentDate(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(safe);
}

/** Builds the POST /document body. Pure; see UNVERIFIED MAPPING for the Method object. */
export function buildYpayDocumentPayload(input: YpayDocumentPayloadInput): Record<string, unknown> {
  const total = ypayMajorAmount(input.totalAmountMinor);
  const date = ypayDocumentDate(input.paidAt);
  const method = {
    type: YPAY_METHOD_TYPE[input.paymentMethod],
    sum: total,
    date,
    // Free-text reference so the accountant can match the bank line / cash entry.
    reference: `${input.paymentMethod === "cash" ? "cash" : "bank transfer"} ${input.paymentId}`,
  };

  const body: Record<string, unknown> = {
    docType: input.docType,
    lang: input.language,
    currency: input.currency.toUpperCase(),
    mail: input.mail ?? false,
    signDoc: true,
    closeDoc: true,
    chargeIdentifier: input.paymentId,
    contact: {
      email: input.contact.email,
      name: input.contact.name,
      ...(input.contact.mobile ? { mobile: input.contact.mobile } : {}),
      ...(input.contact.businessId ? { businessID: input.contact.businessId } : {}),
    },
    items: [
      {
        price: total,
        quantity: 1,
        vatIncluded: true,
        name: input.lineName,
        description: input.lineDescription ?? input.lineName,
      },
    ],
    [METHOD_FIELD]: [method],
  };

  // The PDF marks the free-text description as "not for docType 108".
  if (input.docType === YPAY_DOC_TYPE_INVOICE_RECEIPT && input.lineDescription) {
    body.description = input.lineDescription;
  }

  return body;
}

export interface YpayDocumentResponse {
  externalDocumentId: string;
  externalDocumentNumber: string;
  documentUrl: string;
}

function firstString(json: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = json[key];
    if (value != null && String(value).trim() !== "" && String(value).trim() !== "0") {
      return String(value).trim();
    }
  }
  return null;
}

/**
 * Reads the document id / number / url out of a successful /document response.
 * YPay's callback uses `document_id`, `document_type`, `url`; the same tolerant
 * lookup covers the camel-case variants the PDF shows for direct responses.
 */
export function parseYpayDocumentResponse(json: Record<string, unknown>): YpayDocumentResponse | null {
  // Some responses nest the document under `document`.
  const nested = json.document && typeof json.document === "object"
    ? (json.document as Record<string, unknown>)
    : null;
  const source = nested ?? json;

  const id = firstString(source, ["document_id", "documentId", "docId", "id"]);
  if (!id) return null;
  const number = firstString(source, ["document_number", "documentNumber", "docNumber", "number", "serial"]) ?? id;
  const url = firstString(source, ["url", "document_url", "documentUrl", "pdfUrl", "link"]) ?? "";

  return { externalDocumentId: id, externalDocumentNumber: number, documentUrl: url };
}

/** YPay response codes that mean the cached token is unusable — clear it and retry. */
const TOKEN_ERROR_CODES: ReadonlySet<number> = new Set([
  YPAY_ERROR.UNAUTHORIZED_NO_TOKEN,
  YPAY_ERROR.TOKEN_NOT_64,
  YPAY_ERROR.TOKEN_NOT_EXIST,
  YPAY_ERROR.TOKEN_EXPIRED,
]);

export function isYpayTokenError(code: number | undefined): boolean {
  return code !== undefined && TOKEN_ERROR_CODES.has(code);
}

/**
 * Whether a failed /document call should be retried by the document queue.
 * Token problems and server/network failures are transient; a rejected payload
 * (bad docType, missing contact/items/methods, unknown currency) will fail the
 * same way every time and must surface to an admin instead.
 */
export function isRetryableYpayDocumentError(params: { code?: number; httpStatus?: number }): boolean {
  if (isYpayTokenError(params.code)) return true;
  if (params.code === undefined) {
    // No responseCode: network failure, timeout, non-JSON body or HTTP error.
    return params.httpStatus === undefined || params.httpStatus >= 500;
  }
  return params.code === YPAY_ERROR.TOKEN_ALREADY_ACTIVE;
}

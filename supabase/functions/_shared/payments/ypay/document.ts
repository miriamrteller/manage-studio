/**
 * YPay standalone document issuance ("Document Generator", POST /document).
 *
 * Used for money that did NOT go through YPay's hosted page — cash and bank
 * transfers recorded by the photographer. YPay numbers and signs the document,
 * so the app never self-numbers a tax document (Israeli law requires a certified
 * system to issue it).
 *
 * Field names and codes below are taken from the YPay API document v2.1
 * (22-09-2026, https://ypay.co.il/assets/files/api/ypay_api_documentation.pdf):
 *
 *   POST /document  { docType, mail, discount, discountType, rounding, signDoc,
 *                     details, lang, currency, currencyRate, contact, items, methods }
 *   Method          { type (M), total (M), date "Y-m-d" (O, default today),
 *                     bankId / bankBranch / bankAccount / transactionId (cheque),
 *                     cardType, payments (credit card), app_type (payment app) }
 *   Payment Methods 1 מזומן (cash) · 2 העברה בנקאית (bank transfer) · 3 שיק (cheque)
 *                   4 אשראי (credit card) · 5 PayPal · 6 payment app
 *   Document Types  108 קבלה (receipt) · 109 חשבונית מס קבלה (invoice-receipt);
 *                   0 is rejected by the Document Generator
 *   Response        { url, serial_number, responseCode }
 *   Items           "attached to the document, except for document type = 108";
 *                   3022 fires when items total ≠ methods total, so both carry the
 *                   same gross amount.
 *
 * The helpers here are pure so they can be unit-tested without a network.
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

/** Request field that carries the payment-method array (v2.1 "methods: Method[]", mandatory). */
export const METHOD_FIELD = "methods";

/** YPay "Payment Methods" table (v2.1 p.20): 1 cash, 2 bank transfer, 3 cheque, 4 credit card, 5 PayPal, 6 app. */
export const YPAY_METHOD_TYPE: Record<OfflinePaymentMethod, number> = {
  cash: 1,
  bank_transfer: 2,
};

export interface YpayDocumentPayloadInput {
  docType: YpayDocType;
  /** payments.id — written into `details` so the document can be traced back. */
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

/** Builds the POST /document body (v2.1 "Document Generator"). Pure. */
export function buildYpayDocumentPayload(input: YpayDocumentPayloadInput): Record<string, unknown> {
  const total = ypayMajorAmount(input.totalAmountMinor);
  const date = ypayDocumentDate(input.paidAt);

  const details = [input.lineDescription?.trim(), `#${input.paymentId}`].filter(Boolean).join(" · ");

  return {
    docType: input.docType,
    mail: input.mail ?? false,
    // The document must say exactly what was received; never let YPay round it.
    rounding: false,
    signDoc: true,
    details,
    lang: input.language,
    currency: input.currency.toUpperCase(),
    contact: {
      email: input.contact.email,
      name: input.contact.name,
      ...(input.contact.mobile ? { mobile: input.contact.mobile } : {}),
      ...(input.contact.businessId ? { businessID: input.contact.businessId } : {}),
    },
    // Same gross amount as the method, or YPay answers 3022.
    items: [
      {
        price: total,
        quantity: 1,
        vatIncluded: true,
        name: input.lineName,
        description: input.lineDescription?.trim() || input.lineName,
      },
    ],
    [METHOD_FIELD]: [
      {
        type: YPAY_METHOD_TYPE[input.paymentMethod],
        total,
        date,
      },
    ],
  };
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
 * Reads the document out of a successful /document response.
 * v2.1 documents `{ url, serial_number, responseCode }`; the payment callback
 * uses `document_id` / `url`, so those spellings are accepted too.
 */
export function parseYpayDocumentResponse(json: Record<string, unknown>): YpayDocumentResponse | null {
  const number = firstString(json, ["serial_number", "serialNumber", "document_id", "documentId"]);
  if (!number) return null;
  const url = firstString(json, ["url", "document_url", "documentUrl"]) ?? "";
  return { externalDocumentId: number, externalDocumentNumber: number, documentUrl: url };
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

/** Transient accessToken outcomes: a token is already active (reuse it) or YPay's token service hiccuped. */
const TRANSIENT_CODES: ReadonlySet<number> = new Set([
  YPAY_ERROR.TOKEN_ALREADY_ACTIVE,
  YPAY_ERROR.TOKEN_ALREADY_ACTIVE_LEGACY,
  YPAY_ERROR.ACCESS_TOKEN_GENERAL_ERROR,
  YPAY_ERROR.DOCUMENT_GENERAL_ERROR,
]);

/**
 * Whether a failed /document call should be retried by the document queue.
 * Token problems and server/network failures are transient; a rejected payload
 * (bad docType, missing contact/items/methods, totals mismatch, unknown currency,
 * bad credentials, Tax Authority rejection) fails the same way every time and
 * must surface to an admin instead.
 */
export function isRetryableYpayDocumentError(params: { code?: number; httpStatus?: number }): boolean {
  if (isYpayTokenError(params.code)) return true;
  if (params.code === undefined) {
    // No responseCode: network failure, timeout, non-JSON body or HTTP error.
    return params.httpStatus === undefined || params.httpStatus >= 500;
  }
  return TRANSIENT_CODES.has(params.code);
}

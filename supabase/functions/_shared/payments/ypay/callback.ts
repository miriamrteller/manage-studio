import { ChargeMetadataSchema, type ChargeMetadata, type PaymentEvent } from "../types.ts";

/**
 * YPay notifyUrl callback payload (API v1.9, "Transaction Information").
 * Values may arrive as strings; `success` is "true"/"false".
 */
export interface YpayCallbackData {
  success?: string | boolean;
  transactionId?: string | number;
  /** Our chargeIdentifier, echoed back when we pass it as the charge id. */
  chargeIdentifier?: string;
  url?: string;
  sum?: string | number;
  document_id?: string | number;
  document_type?: string | number;
}

export interface ParsedYpayCallback {
  event: PaymentEvent;
  /** chargeIdentifier we generated at createCharge time (our provider_payment_ref). */
  chargeIdentifier: string;
  /** YPay's transaction id — used to verify the charge via getTransactionsInfo. */
  transactionId: string | null;
  document: {
    externalDocumentId: string;
    documentUrl?: string;
    documentType?: string;
  } | null;
}

function isTruthyFlag(value: string | boolean | undefined): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const n = value.trim().toLowerCase();
  return n === "true" || n === "1";
}

/** Major units (NIS) → minor (agorot). */
export function minorFromYpayAmount(amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid YPay sum: ${String(amount)}`);
  }
  return Math.round(n * 100);
}

/** Extract callback data from a JSON or form-urlencoded body. */
export function extractYpayCallbackData(rawBody: string): YpayCallbackData {
  const trimmed = rawBody.trim();
  if (!trimmed) throw new Error("YPay callback body empty");

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as YpayCallbackData;
  }

  const params = new URLSearchParams(trimmed);
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj as YpayCallbackData;
}

/** Peek our chargeIdentifier from the callback without full validation. */
export function peekYpayChargeIdentifier(rawBody: string): string | undefined {
  try {
    const data = extractYpayCallbackData(rawBody);
    const id = data.chargeIdentifier != null ? String(data.chargeIdentifier).trim() : "";
    return id || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse a YPay callback into a PaymentEvent, using metadata from the pending row.
 *
 * The callback is UNSIGNED, so a `success` here is only a claim — the caller must
 * confirm it against getTransactionsInfo before settling (see verify-callback.ts).
 */
export function parseYpayCallback(
  rawBody: string,
  chargeIdentifier: string,
  metadata: ChargeMetadata,
): ParsedYpayCallback {
  const data = extractYpayCallbackData(rawBody);
  const succeeded = isTruthyFlag(data.success);
  const transactionId =
    data.transactionId != null && String(data.transactionId).trim() !== "0"
      ? String(data.transactionId).trim()
      : null;

  if (succeeded && !transactionId) {
    throw new Error("YPay success callback missing transactionId");
  }

  const amountMinor =
    data.sum != null && data.sum !== ""
      ? minorFromYpayAmount(data.sum)
      : Number(metadata.total_amount_minor ?? 0);

  const event: PaymentEvent = {
    type: succeeded ? "payment.succeeded" : "payment.failed",
    providerPaymentRef: transactionId ?? chargeIdentifier,
    metadata: ChargeMetadataSchema.parse(metadata),
    amountMinor,
    currency: "ILS",
    pretaxAmountMinor: Number(metadata.pretax_amount_minor ?? 0),
    vatAmountMinor: Number(metadata.vat_amount_minor ?? 0),
    vatRate: Number(metadata.vat_rate ?? 0),
    offeringId: metadata.offering_id,
    personId: metadata.person_id,
    failureMessage: succeeded ? undefined : "YPay payment failed",
  };

  let document: ParsedYpayCallback["document"] = null;
  if (succeeded && data.document_id != null && String(data.document_id).trim()) {
    document = {
      externalDocumentId: String(data.document_id).trim(),
      documentUrl: data.url ? String(data.url).trim() : undefined,
      documentType: data.document_type != null ? String(data.document_type).trim() : undefined,
    };
  }

  return { event, chargeIdentifier, transactionId, document };
}

import { ChargeMetadataSchema, type ChargeMetadata, type PaymentEvent } from "../types.ts";

function parseFormBody(rawBody: string): URLSearchParams {
  return new URLSearchParams(rawBody);
}

function isGrowNotifyBody(params: URLSearchParams): boolean {
  return params.has("transactionId") || params.has("processId") || params.has("customFields");
}

/** Reject canonical JSON PaymentEvent blobs — iCount IPN is URL-encoded form fields. */
export function isJsonPaymentEventBody(rawBody: string): boolean {
  const trimmed = rawBody.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed.type === "string" && typeof parsed.providerPaymentRef === "string";
  } catch {
    return false;
  }
}

function metadataFromIpnParams(params: URLSearchParams, sum: number): ChargeMetadata {
  const chargeTypeRaw = params.get("charge_type") ?? "initial";
  const metadataRaw = {
    tenant_id: params.get("tenant_id") ?? "",
    engagement_id: params.get("engagement_id") ?? "",
    billing_account_id: params.get("billing_account_id") ?? "",
    charge_type: chargeTypeRaw === "renewal" ? "renewal" : "initial",
    billing_schedule_id: params.get("billing_schedule_id") || undefined,
    offering_id: params.get("offering_id") || undefined,
    person_id: params.get("person_id") || undefined,
    vat_rate: params.get("vat_rate") ?? "0",
    pretax_amount_minor: params.get("pretax_amount_minor") ?? "0",
    vat_amount_minor: params.get("vat_amount_minor") ?? "0",
    total_amount_minor: params.get("total_amount_minor") ?? String(Math.round(sum * 100)),
  };
  return ChargeMetadataSchema.parse(metadataRaw);
}

/**
 * Parse iCount CC page / cc/bill IPN (URL-encoded form body) into canonical PaymentEvent.
 * Rejects Grow notify bodies and JSON PaymentEvent blobs.
 */
export function parseIcountIpn(rawBody: string): PaymentEvent {
  if (isJsonPaymentEventBody(rawBody)) {
    throw new Error("iCount IPN parser rejected JSON PaymentEvent body");
  }

  const params = parseFormBody(rawBody);

  if (isGrowNotifyBody(params)) {
    throw new Error("iCount IPN parser rejected Grow notify body");
  }

  const confirmationCode = params.get("confirmation_code")?.trim();
  if (!confirmationCode) {
    throw new Error("iCount IPN missing confirmation_code");
  }

  const sumStr = params.get("sum");
  const sum = sumStr ? parseFloat(sumStr) : NaN;
  if (!Number.isFinite(sum)) {
    throw new Error("iCount IPN missing or invalid sum");
  }

  const currency = (params.get("currency_code") ?? "ILS").toUpperCase();
  const metadata = metadataFromIpnParams(params, sum);

  return {
    type: "payment.succeeded",
    providerPaymentRef: confirmationCode,
    metadata,
    amountMinor: Math.round(sum * 100),
    currency,
    pretaxAmountMinor: 0,
    vatAmountMinor: 0,
    vatRate: 0,
    offeringId: metadata.offering_id,
    personId: metadata.person_id,
  };
}

/** Serialize IPN field map to URL-encoded body (mock + tests). */
export function encodeIcountIpnBody(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

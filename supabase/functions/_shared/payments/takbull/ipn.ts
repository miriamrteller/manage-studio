/**
 * A Takbull payment notice (IPN). Takbull calls the IPNAddress we gave the order with query
 * parameters (docs: uniqId, order_reference, statusCode, statusDescription, takbullAction,
 * transactionInternalNumber). Nothing in it is trusted: it only says which order to check.
 */
export interface TakbullIpn {
  uniqId: string | null;
  orderReference: string | null;
  statusCode: number | null;
  statusDescription: string | null;
  action: string | null;
  transactionInternalNumber: string | null;
}

/** Pure: read the notice from the URL query, or from a form / JSON body if Takbull POSTs it. */
export function parseTakbullIpn(url: string, body = ""): TakbullIpn {
  const params = new URL(url).searchParams;
  let extra: Record<string, unknown> = {};
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      extra = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      extra = {};
    }
  } else if (trimmed.includes("=")) {
    extra = Object.fromEntries(new URLSearchParams(trimmed));
  }
  const read = (key: string): string | null => {
    const v = params.get(key) ?? extra[key];
    const s = v == null ? "" : String(v).trim();
    return s === "" ? null : s;
  };
  const code = read("statusCode");
  return {
    uniqId: read("uniqId"),
    orderReference: read("order_reference"),
    statusCode: code !== null && /^-?\d+$/.test(code) ? Number(code) : null,
    statusDescription: read("statusDescription"),
    action: read("takbullAction"),
    transactionInternalNumber: read("transactionInternalNumber"),
  };
}

/** Takbull paymentMethod → payments.payment_method. Bit stays Bit; wallets are card payments. */
export function takbullPaymentMethod(method: number | null | undefined): "card" | "bit" {
  return Number(method) === 21 ? "bit" : "card";
}

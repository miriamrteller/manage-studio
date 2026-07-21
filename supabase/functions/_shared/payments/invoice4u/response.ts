/**
 * Invoice4U API response envelope handling.
 *
 * Three properties of this API are easy to get wrong, and all three are pinned by
 * contract tests against recorded QA responses (see ./fixtures):
 *
 *  1. Every response is wrapped in a .NET WCF envelope: `{ "d": { ... } }`.
 *  2. Failures come back as **HTTP 200** with a populated `Errors[]`. Checking
 *     `response.ok` alone will read a failed clearing request as a success.
 *  3. The error member is spelled `Paramters` — a typo in their API, not ours.
 *
 * Recorded via the U0 QA probe; see fixtures/qa-probe-summary.json.
 */

/** Error codes we branch on. Others are surfaced verbatim. */
export const INVOICE4U_ERROR = {
  /** Unauthorised — API key not recognised. */
  UNAUTHORIZED_USER: 80,
  /** API key is not a well-formed GUID. */
  API_KEY_MALFORMED: 303,
  /** No stored token for that customer. */
  TOKEN_MISSING_FOR_CUSTOMER: 304,
  /** Tokenization not enabled on the clearing terminal. */
  TOKENIZATION_NOT_APPROVED: 309,
  /** Standing orders not enabled on the clearing terminal. */
  STANDING_ORDER_NOT_APPROVED: 310,
  /** No clearing terminal attached to the account at all. */
  CLEARING_TERMINAL_MISSING: 96,
} as const;

export type Invoice4uError = {
  /** Numeric code, e.g. 309. */
  id: number;
  /** Symbolic name, e.g. "ApiTokenizationNotApprovedInClearingTerminal". */
  error: string;
};

/** Unwraps the `{ "d": ... }` envelope. Returns the body itself when absent. */
export function unwrapInvoice4uEnvelope(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invoice4U response body is not an object");
  }
  const record = body as Record<string, unknown>;
  const inner = record.d;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return record;
}

/** Errors reported inside the payload. Empty array means success. */
export function extractInvoice4uErrors(payload: Record<string, unknown>): Invoice4uError[] {
  const raw = payload.Errors;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const id = typeof e.ID === "number" ? e.ID : Number.NaN;
    const error = typeof e.Error === "string" ? e.Error : "UnknownError";
    return [{ id, error }];
  });
}

/** True when the payload carries the given error code. */
export function hasInvoice4uError(payload: Record<string, unknown>, code: number): boolean {
  return extractInvoice4uErrors(payload).some((e) => e.id === code);
}

/**
 * Unwraps and throws on any reported error.
 *
 * Use for every Invoice4U call: an HTTP 200 with `Errors[]` populated is a failure,
 * and treating it as success is how a declined charge becomes a confirmed enrolment.
 */
export function unwrapInvoice4uOrThrow(body: unknown, context: string): Record<string, unknown> {
  const payload = unwrapInvoice4uEnvelope(body);
  const errors = extractInvoice4uErrors(payload);
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.error} (${e.id})`).join(", ");
    throw new Error(`Invoice4U ${context} failed: ${detail}`);
  }
  return payload;
}

/**
 * Capability flags for a clearing terminal, from GetClearingAccount.
 *
 * Tri-state on purpose. Invoice4U returns `null` — not `false` — for every flag when
 * no terminal is attached, and "no terminal" needs a different fix from "terminal
 * without tokenization". Collapsing them to boolean loses that.
 */
export type ClearingTerminalCapabilities = {
  /** False when no terminal is attached to the account. */
  hasTerminal: boolean;
  terminal: string | null;
  isActive: boolean | null;
  /** Tokenization — required for saved cards and renewals. Error 309 when off. */
  isToken: boolean | null;
  /** Standing orders — required for subscriptions. Error 310 when off. */
  isStandingOrder: boolean | null;
  isBitService: boolean | null;
  isGooglePay: boolean | null;
  isApplePay: boolean | null;
  tokenExpiry: string | null;
  standingOrderExpiry: string | null;
};

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Parses a GetClearingAccount payload (already unwrapped) into capability flags. */
export function parseClearingTerminalCapabilities(
  payload: Record<string, unknown>,
): ClearingTerminalCapabilities {
  return {
    hasTerminal: payload.Terminal !== null && payload.Terminal !== undefined,
    terminal: nullableString(payload.Terminal),
    isActive: nullableBoolean(payload.IsActive),
    isToken: nullableBoolean(payload.IsToken),
    isStandingOrder: nullableBoolean(payload.IsStandingOrder),
    isBitService: nullableBoolean(payload.IsBitService),
    isGooglePay: nullableBoolean(payload.IsGooglePay),
    isApplePay: nullableBoolean(payload.IsApplePay),
    tokenExpiry: nullableString(payload.ExpirationDateToken),
    standingOrderExpiry: nullableString(payload.ExpirationDateSO),
  };
}

/**
 * Whether the terminal supports everything this platform needs.
 *
 * Tenants bill monthly, so tokenization AND standing orders must both be enabled;
 * without them renewals fail at charge time rather than at setup time.
 */
export function describeMissingCapabilities(caps: ClearingTerminalCapabilities): string[] {
  if (!caps.hasTerminal) {
    return ["No clearing terminal is attached to this Invoice4U account (error 96)."];
  }

  const missing: string[] = [];
  if (caps.isToken !== true) {
    missing.push("Tokenization is not enabled — saved cards and renewals fail with error 309.");
  }
  if (caps.isStandingOrder !== true) {
    missing.push("Standing orders are not enabled — subscriptions fail with error 310.");
  }
  return missing;
}

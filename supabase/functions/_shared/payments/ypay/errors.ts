/**
 * YPay error codes (API document v2.1, 22-09-2026, "Error Codes Table").
 *
 * Responses carry a numeric `responseCode`; 1 is success, everything else maps here.
 * The earlier v1.9 transcription had shifted rows (2003 ≠ bad credentials, 3001 ≠
 * active token); the legacy aliases are kept so a tenant on an older YPay build
 * still gets the lenient behaviour.
 */
export const YPAY_ERROR = {
  SUCCESS: 1,
  UNAUTHORIZED_NO_TOKEN: 1001,
  TOKEN_NOT_64: 1002,
  TOKEN_NOT_EXIST: 1003,
  TOKEN_EXPIRED: 1004,
  CURRENCY_NOT_FOUND: 1101,
  BAD_CLIENT_CREDENTIALS: 2001,
  TOKEN_ALREADY_ACTIVE: 2002,
  ACCESS_TOKEN_GENERAL_ERROR: 2003,
  DOC_TYPE_INVALID: 3001,
  /** v1.9 table listed "already an active token" at 3001; v2.1 moved it to 2002. */
  TOKEN_ALREADY_ACTIVE_LEGACY: 3001,
  DOCUMENT_DETAILS_MISSING: 3002,
  DOCUMENT_GENERAL_ERROR: 3006,
  DOCUMENT_NOT_APPROVED_BY_TAX_AUTHORITY: 3007,
  PAYMENT_METHODS_MISSING: 3011,
  METHOD_TYPE_INVALID: 3012,
  METHOD_TOTAL_INVALID: 3013,
  DOCUMENT_ITEMS_MISSING: 3021,
  ITEMS_TOTAL_MISMATCH: 3022,
  CHARGE_IDENTIFIER_REQUIRED: 4001,
  CLEARING_LOGIN_ERROR: 4002,
  CLEARING_FAILED: 4003,
  CONTACT_MISSING: 5001,
  CONTACT_FIELD_MISSING: 5002,
  CONTACT_EMAIL_INVALID: 5003,
  ITEMS_MISSING: 6001,
  TRANSACTION_FAILED: 8001,
} as const;

const MESSAGES: Record<number, string> = {
  1001: "Unauthorized — a valid access token is required",
  1002: "Invalid access token (not 64 chars)",
  1003: "Invalid access token (does not exist)",
  1004: "Access token has expired",
  1101: "Currency not in YPay's currency list",
  1201: "Discount can only be between 0 and 100 percent",
  1202: "Discount must be lower than the total amount",
  1203: "Discount must be greater than 0",
  2001: "Bad client id or client secret",
  2002: "There is already an active token for this user",
  2003: "accessToken — general error",
  3001: "Document type missing or invalid",
  3002: "Document details missing",
  3003: "Document serial number missing or invalid",
  3004: "Document not found",
  3005: "Contact not found",
  3006: "Document — general error",
  3007: "Document not approved by the Tax Authority",
  3008: "Document status (closeDoc) is missing",
  3011: "Payment methods missing",
  3012: "Method type missing or invalid",
  3013: "Method total missing or invalid",
  3021: "Document items missing",
  3022: "Total items price not equal to total payment methods amount",
  4001: "A unique charge identifier is required for a charge request",
  4002: "Clearing process failed — UPAY login error",
  4003: "Clearing process failed — UPAY redirect/deposit error",
  4004: "Clearing process failed — general error",
  4005: "No active account for the requested clearing provider",
  4006: "No API permission configured for the requested clearing provider",
  4007: "No active account for credit clearing",
  5001: "Contact is missing",
  5002: "Contact field is missing (name, email are required)",
  5003: "Contact — invalid email format",
  5004: "Contact — maximum name length exceeded",
  5005: "Contact — invalid businessID format",
  5006: "Contact — general error",
  6001: "Items must be defined",
  6002: "Item field is missing (price, quantity are required)",
  6003: "Invoice must include items from the same VAT group",
  7001: "Method — details missing for cheque type",
  7002: "Method — bankId error",
  7003: "Method — payments value must be between 0 and 36",
  8001: "Transaction process failed — UPAY login error",
  8002: "Transaction process failed — UPAY transaction info error",
  8003: "Transaction process failed — general error",
  8004: "Get transactions info failed — missing or malformed transactionIds",
};

export function ypayErrorMessage(code: number | undefined): string {
  if (code === undefined || Number.isNaN(code)) return "Unknown YPay error";
  return MESSAGES[code] ?? `YPay error ${code}`;
}

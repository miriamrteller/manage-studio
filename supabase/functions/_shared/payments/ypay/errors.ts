/**
 * YPay error codes (API v1.9, "Error Codes Table").
 *
 * Responses carry a numeric `responseCode`; 1 is success, everything else maps here.
 * The PDF's table columns are misaligned, so messages are transcribed to intent.
 */
export const YPAY_ERROR = {
  SUCCESS: 1,
  UNAUTHORIZED_NO_TOKEN: 1001,
  TOKEN_NOT_64: 1002,
  TOKEN_NOT_EXIST: 1003,
  TOKEN_EXPIRED: 1004,
  CURRENCY_NOT_FOUND: 1101,
  BAD_CLIENT_CREDENTIALS: 2003,
  TOKEN_ALREADY_ACTIVE: 3001,
  DOC_TYPE_INVALID: 3011,
  CHARGE_IDENTIFIER_REQUIRED: 4001,
  CLEARING_LOGIN_ERROR: 4002,
  CLEARING_FAILED: 4003,
  CONTACT_MISSING: 5003,
  ITEMS_MISSING: 6001,
  TRANSACTION_FAILED: 8001,
} as const;

const MESSAGES: Record<number, string> = {
  1001: "Unauthorized — a valid access token is required",
  1002: "Invalid access token (not 64 chars)",
  1003: "Invalid access token (does not exist)",
  1004: "Access token has expired",
  1101: "Currency not in YPay's currency list",
  2003: "Bad client id or client secret",
  3001: "There is already an active token for this user",
  3011: "Document type missing or invalid",
  3012: "Document details missing",
  3013: "Payment methods missing",
  4001: "A unique charge identifier is required",
  4002: "Clearing process failed — UPAY login error",
  4003: "Clearing process failed — UPAY error",
  5003: "Contact is missing",
  6001: "Items must be defined",
  8001: "Transaction process failed",
};

export function ypayErrorMessage(code: number | undefined): string {
  if (code === undefined || Number.isNaN(code)) return "Unknown YPay error";
  return MESSAGES[code] ?? `YPay error ${code}`;
}

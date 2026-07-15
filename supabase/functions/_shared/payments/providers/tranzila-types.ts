/**
 * tranzila-types.ts — Tranzila-specific internal types
 *
 * These types NEVER cross the adapter boundary.
 * External callers see only IPaymentProvider / IInvoicingProvider from types.ts.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface TranzilaAuthHeaders {
  "X-tranzila-api-app-key":      string;
  "X-tranzila-api-access-token": string;
  "X-tranzila-api-request-time": string;
  "X-tranzila-api-nonce":        string;
}

// ── Pay-by-link ───────────────────────────────────────────────────────────────

export interface TranzilaClient {
  name:               string;
  contact_person?:    string;
  email:              string;
  id?:                string;   // tax ID
  phone_country_code?: string;
  phone_area_code?:   string;
  phone_number?:      string;
  external_id?:       string;
}

export interface TranzilaItem {
  name:          string;
  unit_price:    number;
  units_number:  number;
  type:          "S";
  price_type:    "G";  // VAT-inclusive — Tax Delegation Doctrine; never pass vat_percent
  currency_code: "ILS";
  unit_type?:    number;
}

export interface TranzilaPayByLinkRequest {
  terminal_name:     string;
  created_by_user:   string;
  created_by_system: "OpalSwift";
  created_via:       "TRAPI";
  request_date:      string | null;
  request_language:  "hebrew" | "english";
  response_language: "hebrew" | "english";
  client:            TranzilaClient;
  items:             TranzilaItem[];
  payment_plans:     [1] | [8];
  payment_methods:   number[];
  payments_number:   number;
  action_type?:      1 | 2;
  request_currency?: "ILS";
  send_email?: { sender_name: string; sender_email: string };
  send_sms?:   { sender_name: string };
  pr_token?:   string;
  // DCdisable — deduplication token; format: {bookingId}_{timestamp}
  user_defined_fields?: { name: "DCdisable"; value: string }[];
  // NEVER include: request_vat, vat_percent — Tax Delegation Doctrine
}

export interface TranzilaPayByLinkResponse {
  error_code:    number;
  pr_id?:        string;
  pr_link?:      string;
  error_message?: string;
}

export interface PaymentLinkResult {
  pr_id:   string;
  pr_link: string;
}

export interface PaymentCallbackPayload {
  pr_id:                   string;
  processor_response_code: string;
  error_code:              number;
  amount?:                 number;
  transaction_id?:         string;
  auth_number?:            string;
}

export interface TranzilaPaymentStatus {
  status:       "pending" | "confirmed" | "failed" | "cancelled";
  amount?:      number;
  currency?:    string;
  gatewayTxnId?: string;
  auth_number?: string;
}

// ── STO v2 ────────────────────────────────────────────────────────────────────

export interface STOParams {
  first_charge_date: string;      // YYYY-MM-DD
  charge_frequency:  "monthly";
  amount:            number;
  currency:          "ILS";
  token_id:          string;      // opaque TK token from tranzila_tokens
}

export interface STOUpdateParams {
  first_charge_date?: string;
  amount?:            number;
}

export interface STOResponse {
  sto_id:            string;
  status:            "active" | "cancelled" | "pending";
  next_charge_date?: string;
  error_code?:       number;
  error_message?:    string;
}

// ── Invoicing ─────────────────────────────────────────────────────────────────

export interface TranzilaInvoiceItem {
  name:          string;
  unit_price:    number;
  price_type:    "G";  // VAT-inclusive — never pass vat_percent
  type:          "I";
  units_number?: number;
  unit_type?:    number;
  currency_code: "ILS";
  code?:         string;
  to_doc_currency_exchange_rate?: number;
}

export interface TranzilaInvoicePayment {
  payment_method:          number;
  payment_date:            string;
  amount:                  number;
  currency_code:           "ILS";
  cc_last_4_digits?:       string;
  cc_credit_term?:         number;
  cc_installments_number?: number;
  cc_brand?:               string;
  bank?:                   string;
  bank_branch?:            string;
  bank_account?:           string;
  cheque_number?:          string;
  paypal_account?:         string;
  paypal_transaction_number?: string;
  other_description?:      string;
}

export interface TranzilaCreateDocumentRequest {
  terminal_name:           string;
  document_type?:          "IR" | "RE" | "DI" | "IN";
  document_date?:          string;
  document_currency_code?: "ILS";
  document_language?:      "heb" | "eng";
  response_language?:      "hebrew" | "english";
  action?:                 1 | 3;
  client_name?:            string;
  client_company?:         string;
  client_id?:              string;
  client_email?:           string;
  client_address_line_1?:  string;
  client_address_line_2?:  string;
  client_city?:            string;
  client_country_code?:    string;
  client_zip?:             string;
  txnindex?:               number;
  related_document_number?: string;
  relation_type?:          string;
  canceldoc?:              "Y";
  created_by_system:       "opalswift";
  created_by_user:         string;
  items:                   TranzilaInvoiceItem[];
  payments?:               TranzilaInvoicePayment[];
  // NEVER include: vat_percent — Tax Delegation Doctrine
}

export interface TranzilaCreateDocumentResponse {
  error_code:     number;
  doc_number?:    string;
  pdf_url?:       string;
  retrieval_key?: string;
  created_at?:    string;
  txnindex?:      number;
  error_message?: string;
}

export interface InvoiceResult {
  doc_number:    string;
  pdf_url?:      string;
  retrieval_key: string;
  created_at:    string;
  txnindex?:     number;
}

// ── Tenant config ─────────────────────────────────────────────────────────────

export interface TranzilaConfig {
  /** Per-tenant terminal name — stored encrypted in tenant_credentials */
  terminal_name: string;
  /**
   * Per-tenant credential rotation:
   *   vault:secret/tenants/{tenantId}/tranzila#app_key
   *   vault:secret/tenants/{tenantId}/tranzila#secret_key
   * NOTE: TRANZILA_STO_TERMINAL_NAME is a platform-level env var (OpalSwift's
   * own subscription billing) — it is NOT per-tenant and must NOT be stored here.
   */
}

// ── Error map ─────────────────────────────────────────────────────────────────

export const TRANZILA_ERROR_MAP: Readonly<Record<number, string>> = {
  20000: "TRANZILA_AUTH_FAILED",
  20002: "TRANZILA_WRONG_TERMINAL",
  20004: "TRANZILA_SCHEMA_MISMATCH",
  20403: "TRANZILA_UNSUPPORTED_METHOD",
  20111: "TRANZILA_TOKEN_INVALID",
  20112: "TRANZILA_TXN_NOT_FOUND",
  21100: "TRANZILA_INDEX_MISMATCH",
  21101: "TRANZILA_EMPTY_INDEX",
  22101: "TRANZILA_MISSING_AUTH",
  22100: "TRANZILA_AUTH_MISMATCH",
  22103: "TRANZILA_INVALID_DCDISABLE",
  23002: "TRANZILA_ALREADY_REFUNDED",
  23001: "TRANZILA_INVALID_ORIGINAL_AUTH",
  20300: "TRANZILA_TOO_MANY_METHODS",
  20301: "TRANZILA_STO_INSERT_FAILED",
  20302: "TRANZILA_STO_RETRIEVE_FAILED",
  20303: "TRANZILA_NO_PAYMENT_METHOD",
  20304: "TRANZILA_BAD_DATE",
  20305: "TRANZILA_TOKEN_CREATE_FAILED",
} as const;

export function mapTranzilaError(errorCode: number, message?: string): Error {
  const type = TRANZILA_ERROR_MAP[errorCode] ?? "TRANZILA_GENERIC_ERROR";
  return new Error(`${type}: ${message ?? `error_code=${errorCode}`}`);
}

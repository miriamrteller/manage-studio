/**
 * types.ts — OpalSwift Payment + Invoicing Provider Interfaces
 *
 * Spec version: 1.4.0 (PA conditions PA-1 + PA-2 applied, PCI patch BE-YRP-005 applied)
 * Tax Delegation Doctrine: OpalSwift NEVER computes VAT, ITA thresholds, or eligibility.
 * Adapter Mandate: IPaymentProvider + IInvoicingProvider are the ONLY types visible to callers.
 */

// ── Enums and Union Types ─────────────────────────────────────────────────────

export type CurrencyCode    = 'ILS' | 'USD' | 'EUR';
export type InvoiceStatus   = 'draft' | 'sent' | 'paid' | 'cancelled' | 'overdue';
export type AllocationStatus =
  | 'pending'
  | 'obtained'
  | 'expired'
  | 'rejected'
  | 'not_required'
  | 'error';
export type AllocationSkipReason =
  | 'not_required'
  | 'amount_below_threshold'
  | 'b2c_receipt'
  | 'shaam_unavailable'
  | 'rejected';
export type ChargeStatus        = 'success' | 'failed' | 'pending' | 'cancelled';
export type CheckoutStatus      = 'active' | 'completed' | 'expired' | 'cancelled';
export type PaymentStatus       =
  | 'completed' | 'failed' | 'pending' | 'cancelled'
  | 'refunded' | 'partially_refunded';
export type BillingCycle        = 'monthly' | 'yearly' | 'weekly' | 'daily';
export type SubscriptionStatus  =
  | 'active' | 'cancelled' | 'past_due' | 'paused' | 'incomplete';
export type RefundStatus        = 'completed' | 'failed' | 'pending' | 'cancelled';

// ── PA-1: Opaque WebhookPayload ───────────────────────────────────────────────
// No provider identity leaks through the adapter boundary.
// RapydAdapter.handleWebhook() maps RapydWebhookPayload → WebhookPayload internally.
// All future payment adapters (Grow, iCount PayPage) implement the same mapping.
// No caller outside an adapter ever sees RapydWebhookPayload.

export interface WebhookPayload {
  readonly eventId:   string;
  readonly eventType: string;
  readonly timestamp: string;  // ISO 8601 UTC
  readonly metadata:  Record<string, unknown>;
}

// ── PCI-Compliant Card Tokenisation Interfaces (PA-YRP-002 / BE-YRP-005) ─────
// Raw card data (cardNumber, cvv, expiry) NEVER enters OpalSwift's server.

/** Server → Yesh: request a short-lived session token for the client browser. */
export interface YeshGenerateRequestTokenRequest {
  clientId: string;
}

/** Yesh → Server: short-lived requestToken consumed by Yesh JS plugin. */
export interface YeshGenerateRequestTokenResponse {
  success:       boolean;
  requestToken?: string;
  expiresAt?:    string;   // ISO timestamp — ⚠️ Day-1: confirm field name from sandbox
  error?:        string;
  errorCode?:    number;
}

/** OpalSwift server → client browser: consumed by Yesh JS plugin. */
export interface TokenSessionResponse {
  requestToken: string;
  expiresAt:    string; // ISO timestamp
}

/**
 * Inbound to OpalSwift from client browser after Yesh JS plugin resolves.
 * OpalSwift endpoint contract — NOT a Yesh API type.
 * cardNumber, cvv, expiry MUST NEVER appear here.
 */
export interface ClientTokenConfirmation {
  clientId: string;
  tokenId:  string;  // Opaque token returned by Yesh JS plugin
}

// ── Core Domain Types ────────────────────────────────────────────────────────

export interface InvoiceData {
  tenantId:    string;
  clientName:  string;
  clientPhone: string;
  clientEmail?: string;
  amount:      string;  // decimal as string
  currency:    CurrencyCode;
  lineItems:   LineItem[];
  /**
   * Derived from client profile: true when client.type === 'business'.
   * NEVER computed from invoice amount (Tax Delegation Doctrine).
   * Fail-safe: if absent or null, treat as TRUE (conservative compliance).
   */
  b2bFlag:     boolean;
  dueDate?:    string;  // ISO date
  language?:   'he' | 'en';
  /**
   * Tranzila document type code — e.g. 'IR' (Invoice + Receipt), 'I' (Invoice only).
   * Optional: defaults to 'IR' if not supplied. Caller-supplied values are passed through
   * to the Tranzila API without modification. (R-03 fix)
   */
  documentType?: string;
}

export interface LineItem {
  description: string;
  quantity:    number;
  unitPrice:   string;  // decimal as string
  totalPrice:  string;  // decimal as string
  vatRate?:    number;
}

export interface InvoiceResponse {
  docnum:             string;
  lawNumber:          string;
  pdfUrl?:            string;
  status:             InvoiceStatus;
  allocationRequired: boolean;
  createdAt:          string;  // ISO timestamp
}

export interface AllocationResponse {
  allocationNumber: string | null;  // null = Yesh determined not required or SHAAM error
  status:           AllocationStatus;
  skipReason?:      AllocationSkipReason;  // populated when allocationNumber = null
  shaamReference?:  string;
}

export interface J5Params {
  amount:           string;  // decimal as string
  currency:         CurrencyCode;
  description:      string;
  clientReference?: string;
}

export interface ChargeResponse {
  transactionId: string;
  status:        ChargeStatus;
  amount:        string;
  currency:      CurrencyCode;
  processedAt:   string;  // ISO timestamp
  failureReason?: string;
}

export interface PaymentMeta {
  tenantId:     string;
  clientName:   string;
  clientEmail?: string;
  clientPhone?: string;
  description:  string;
  currency:     CurrencyCode;
  successUrl:   string;
  errorUrl:     string;
  webhookUrl:   string;
}

export interface CheckoutResponse {
  checkoutId:   string;
  redirectUrl:  string;
  status:       CheckoutStatus;
  expiresAt:    string;  // ISO timestamp
}

export interface PaymentResult {
  paymentId:   string;
  status:      PaymentStatus;
  amount:      string;
  currency:    CurrencyCode;
  tenantId:    string;
  metadata:    Record<string, unknown>;
  processedAt: string;  // ISO timestamp
}

export interface PlanParams {
  planId:       string;
  customerId:   string;
  billingCycle: BillingCycle;
  amount:       string;  // decimal as string
  currency:     CurrencyCode;
  trialDays?:   number;
}

export interface SubscriptionResponse {
  subscriptionId:      string;
  status:              SubscriptionStatus;
  currentPeriodStart:  string;  // ISO timestamp
  currentPeriodEnd:    string;  // ISO timestamp
  nextBillingDate:     string;  // ISO timestamp
}

export interface RefundResponse {
  refundId:          string;
  status:            RefundStatus;
  amount:            string;
  currency:          CurrencyCode;
  processedAt:       string;  // ISO timestamp
  originalPaymentId: string;
}

export interface VATReport {
  month:         string;  // YYYY-MM
  tenantId:      string;
  totalSales:    string;  // decimal as string
  totalVAT:      string;  // decimal as string
  invoiceCount:  number;
  generatedAt:   string;  // ISO timestamp
  reportUrl?:    string;
}

// ── Core Provider Interfaces ──────────────────────────────────────────────────

/**
 * IInvoicingProvider — the only invoicing type visible to callers outside the factory.
 * Implemented by: YeshInvoiceAdapter, ICountInvoicingAdapter
 */
export interface IInvoicingProvider {
  createInvoice(data: InvoiceData): Promise<InvoiceResponse>;
  createITAAllocation(docnum: string): Promise<AllocationResponse>;
  captureJ5(tokenId: string, params: J5Params): Promise<ChargeResponse>;
  sendInvoiceSMS(docnum: string, phone: string): Promise<void>;
  getVATReport(month: string, tenantId: string): Promise<VATReport>;
  /** Step 1 of PCI SAQ A card tokenisation: obtain short-lived requestToken for Yesh JS plugin. */
  addTokenSession(clientId: string): Promise<TokenSessionResponse>;
}

/**
 * IPaymentProvider — the only payment type visible to callers outside the factory.
 * Implemented by: RapydAdapter, GrowAdapter, ICountPayPageAdapter
 */
export interface IPaymentProvider {
  createCheckout(amount: number, meta: PaymentMeta): Promise<CheckoutResponse>;
  /** PA-1: uses opaque WebhookPayload — no provider identity leaks to callers. */
  handleWebhook(payload: WebhookPayload): Promise<PaymentResult>;
  createSubscription(plan: PlanParams): Promise<SubscriptionResponse>;
  chargeToken(customerId: string, amount: number): Promise<ChargeResponse>;
  issueRefund(paymentId: string, amount?: number): Promise<RefundResponse>;
}

// ── Rapyd Internal Types (never exposed outside RapydAdapter) ────────────────

/** Rapyd-native webhook shape — never leaves the adapter boundary. */
export interface RapydWebhookPayload {
  id:                   string;
  type:                 string;
  data: {
    id:                  string;
    amount:              number;
    currency:            string;
    status:              string;
    payment_method_type: string;
    created_at:          number;
    metadata:            Record<string, unknown>;
  };
  trigger_operation_id: string;
  status:               string;
  created_at:           number;
}

export interface RapydStatus {
  error_code:     string;
  status:         string;   // "SUCCESS" | "ERROR"
  message:        string;
  response_code:  string;
  operation_id:   string;
}

export interface RapydCheckoutRequest {
  amount:                          string;  // MUST be string: "12.50"
  currency:                        string;
  country:                         string;
  payment_method_types_include?:   string[];
  payment_method_types_exclude?:   string[];
  customer?:                       string;
  merchant_reference_id?:          string;
  description?:                    string;
  metadata?:                       Record<string, string>;
  complete_checkout_url?:          string;
  error_payment_url?:              string;
  expiration?:                     number;
  payment_expiration?:             number;
  // escrow: NOT USED — OpalSwift does not hold funds in escrow.
}

export interface RapydCheckoutResponse {
  status: RapydStatus;
  data?: {
    id:                      string;
    redirect_url:            string;
    status:                  string;
    page_expiration:         number;
    merchant_reference_id?:  string;
    customer?:               string;
    payment?: {
      id:         string;
      amount:     number;
      currency:   string;
      status:     string;
      created_at: number;
    };
  };
}

export interface RapydRefundRequest {
  payment:               string;
  amount?:               string;  // MUST be string for partial refunds
  currency?:             string;
  reason?:               string;
  metadata?:             Record<string, string>;
  merchant_reference_id?: string;
}

export interface RapydSubscriptionRequest {
  customer:                string;
  payment_method:          string;
  subscription_items: Array<{
    plan:       string;
    quantity?:  number;
  }>;
  billing_cycle_anchor?:   number;
  cancel_at_period_end?:   boolean;
  days_until_due?:         number;
  metadata?:               Record<string, string>;
  trial_end?:              number;
  trial_period_days?:      number;
}

// ── Yesh Internal Types ───────────────────────────────────────────────────────

export interface YeshCreateDocumentRequest {
  type:      number;  // ⚠️ Day-1: confirm valid type codes from sandbox
  client: {
    name:   string;
    phone?: string;
    email?: string;
    id?:    string;
  };
  currency:  number;  // 1=ILS, 2=USD, 3=EUR
  lang:      number;  // 1=Hebrew, 2=English
  items: Array<{
    catalog:      string;
    description:  string;
    quantity:     number;
    price:        string;  // MUST be string (decimal precision)
    total:        string;  // MUST be string
    vat?:         number;
  }>;
  remarks?: string;
  date?:    string;  // YYYY-MM-DD
  dueDate?: string;  // YYYY-MM-DD
}

export interface YeshCreateDocumentResponse {
  success:    boolean;
  docnum:     string;
  lawNumber:  string;
  pdfLink?:   string;
  error?:     string;
  errorCode?: number;
}

export interface YeshAllocationRequest {
  docnum: string;
}

export interface YeshAllocationResponse {
  success:          boolean;
  allocationNumber?: string;
  status:           string;  // "pending" | "obtained" | "rejected" | "not_required"
  validUntil?:      string;
  shaamReference?:  string;
  error?:           string;
  errorCode?:       number;
}

export interface YeshSMSRequest {
  docnum:    string;
  phone:     string;  // +972XXXXXXXXX
  template?: string;
}

export interface YeshSMSResponse {
  success:    boolean;
  messageId?: string;
  error?:     string;
  errorCode?: number;
}

export interface YeshVATReportResponse {
  success: boolean;
  report?: {
    month:         string;
    totalSales:    number;
    totalVAT:      number;
    invoiceCount:  number;
    reportUrl?:    string;
    details?: Array<{
      docnum:     string;
      lawNumber:  string;
      amount:     number;
      vat:        number;
      date:       string;
    }>;
  };
  error?:     string;
  errorCode?: number;
}

// ── Tenant Config Types ───────────────────────────────────────────────────────

export interface RapydConfig {
  access_key:    string;   // non-sensitive, safe in DB
  secret_key_ref: string;  // vault reference — NEVER plaintext
  sandbox:       boolean;
  customer_id?:  string;
}

export interface YeshConfig {
  api_key_ref:  string;  // vault reference — NEVER plaintext
  company_id:   string;
}

export interface TranzilaConfig {
  /**
   * Per-tenant terminal name — stored encrypted in tenant_credentials.
   * Provisioned manually via my.tranzila.com (no API provisioning — Q2 resolution).
   * Credential rotation:
   *   vault:secret/tenants/{tenantId}/tranzila#app_key
   *   vault:secret/tenants/{tenantId}/tranzila#secret_key
   * NOTE: TRANZILA_STO_TERMINAL_NAME is a platform-level env var for OpalSwift's
   * own subscription billing. It is NOT per-tenant and must NOT be stored here.
   */
  terminal_name: string;
}

export interface TenantProviderConfig {
  id:                 string;
  payment_provider:   'rapyd' | 'icount_paypage' | 'grow' | 'tranzila';
  invoicing_provider: 'yesh' | 'icount' | 'tranzila';
  rapyd_config?:      RapydConfig;
  yesh_config?:       YeshConfig;
  tranzila_config?:   TranzilaConfig;
  /** Injected by factory callers — required for TranzilaInvoicingAdapter (PDF storage + DB writes) */
  supabaseClient?:    unknown;
}

// ── Error Classes ─────────────────────────────────────────────────────────────

export class InvoicingProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus?: number,
    public providerResponse?: unknown
  ) {
    super(message);
    this.name = 'InvoicingProviderError';
  }
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus?: number,
    public providerResponse?: unknown
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public provider: 'yesh' | 'rapyd'
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class WebhookError extends Error {
  constructor(
    message: string,
    public code: string,
    public payload?: unknown
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

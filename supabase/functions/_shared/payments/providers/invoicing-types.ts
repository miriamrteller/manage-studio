/**
 * Invoicing provider interface and all associated types.
 * Matches be-adapter-spec.md v1.4.0 §1 exactly.
 *
 * Tax Delegation Doctrine: OpalSwift never computes VAT, never evaluates ITA
 * thresholds, and never makes any compliance eligibility decision. All tax
 * processing is fully delegated to Yesh Invoice. Violation is a Gate 5 blocker.
 *
 * PCI DSS SAQ A: raw card data (cardNumber, cvv, expiry) MUST NEVER appear in
 * any OpalSwift interface or be handled server-side at any step.
 */

// ── Enums / union types ──────────────────────────────────────────────────────

export type CurrencyCode = "ILS" | "USD" | "EUR";
export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled" | "overdue";
export type AllocationStatus = "pending" | "obtained" | "expired" | "rejected" | "not_required";
export type ChargeStatus = "success" | "failed" | "pending" | "cancelled";
export type CheckoutStatus = "active" | "completed" | "expired" | "cancelled";
export type PaymentStatus =
  | "completed"
  | "failed"
  | "pending"
  | "cancelled"
  | "refunded"
  | "partially_refunded";
export type BillingCycle = "monthly" | "yearly" | "weekly" | "daily";
export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "past_due"
  | "paused"
  | "incomplete";
export type RefundStatus = "completed" | "failed" | "pending" | "cancelled";

// ── Core data shapes ─────────────────────────────────────────────────────────

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: string; // decimal as string
  totalPrice: string; // decimal as string
  vatRate?: number;
}

export interface InvoiceData {
  tenantId: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  amount: string; // decimal as string
  currency: CurrencyCode;
  lineItems: LineItem[];
  /**
   * true when client.type === 'business' in the booking/client record.
   * NEVER computed by OpalSwift from invoice amount.
   * Fail-safe: if absent or null, treat as TRUE (always request allocation —
   * conservative compliance position).
   */
  b2bFlag: boolean;
  dueDate?: string; // ISO date
  language?: "he" | "en";
}

export interface InvoiceResponse {
  docnum: string;
  lawNumber: string;
  pdfUrl?: string;
  status: InvoiceStatus;
  allocationRequired: boolean;
  createdAt: string; // ISO timestamp
}

export interface AllocationResponse {
  /**
   * null when Yesh determines not required (below threshold, B2C, etc.).
   * OpalSwift stores whatever Yesh returns — no threshold logic here.
   */
  allocationNumber: string | null;
  status: AllocationStatus;
  /**
   * validUntil: REMOVED — not in verified Yesh docs.
   * Day-1 Dev Task: confirm whether Yesh returns any expiry field; add back only if confirmed.
   */
  shaamReference?: string;
}

export interface J5Params {
  amount: string; // decimal as string
  currency: CurrencyCode;
  description: string;
  clientReference?: string;
}

export interface ChargeResponse {
  transactionId: string;
  status: ChargeStatus;
  amount: string;
  currency: CurrencyCode;
  processedAt: string; // ISO timestamp
  failureReason?: string;
}

export interface VATReport {
  month: string; // YYYY-MM
  tenantId: string;
  totalSales: string; // decimal as string
  totalVAT: string; // decimal as string
  invoiceCount: number;
  generatedAt: string; // ISO timestamp
  reportUrl?: string;
}

// ── PCI-compliant card tokenisation (PA-YRP-002) ─────────────────────────────

/**
 * Returned by IInvoicingProvider.addTokenSession().
 * Passed to client browser; consumed by Yesh JS plugin to initiate card capture.
 * Raw card data NEVER enters OpalSwift's server.
 */
export interface TokenSessionResponse {
  requestToken: string;
  expiresAt: string; // ISO timestamp
}

/**
 * Inbound to OpalSwift from client browser AFTER Yesh JS plugin resolves.
 * This is an OpalSwift endpoint contract — NOT a Yesh API type.
 * cardNumber, cvv, expiry MUST NEVER appear in any OpalSwift inbound interface.
 */
export interface ClientTokenConfirmation {
  clientId: string;
  /** Opaque token returned by Yesh JS plugin after client-side card entry. */
  tokenId: string;
}

// ── Payment provider shapes ──────────────────────────────────────────────────

export interface PaymentMeta {
  tenantId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  description: string;
  currency: CurrencyCode;
  successUrl: string;
  errorUrl: string;
  webhookUrl: string;
}

export interface CheckoutResponse {
  checkoutId: string;
  redirectUrl: string;
  status: CheckoutStatus;
  expiresAt: string; // ISO timestamp
}

export interface PaymentResult {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  currency: CurrencyCode;
  tenantId: string;
  metadata: Record<string, unknown>;
  processedAt: string; // ISO timestamp
}

export interface PlanParams {
  planId: string;
  customerId: string;
  billingCycle: BillingCycle;
  amount: string; // decimal as string
  currency: CurrencyCode;
  trialDays?: number;
}

export interface SubscriptionResponse {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string; // ISO timestamp
  currentPeriodEnd: string; // ISO timestamp
  nextBillingDate: string; // ISO timestamp
}

export interface RefundResponse {
  refundId: string;
  status: RefundStatus;
  amount: string;
  currency: CurrencyCode;
  processedAt: string; // ISO timestamp
  originalPaymentId: string;
}

/**
 * Opaque webhook payload — PA-1 applied. No provider identity leaks through
 * the adapter boundary. RapydAdapter.handleWebhook() maps
 * RapydWebhookPayload → WebhookPayload internally.
 */
export interface WebhookPayload {
  readonly eventId: string;
  readonly eventType: string;
  readonly timestamp: string; // ISO 8601 UTC
  readonly metadata: Record<string, unknown>;
}

// ── Core provider interfaces ─────────────────────────────────────────────────

/**
 * IInvoicingProvider — implemented by YeshInvoiceAdapter (and MockYeshAdapter).
 * Adapter pattern mandate: only providerFor() may instantiate concrete adapters.
 */
export interface IInvoicingProvider {
  createInvoice(data: InvoiceData): Promise<InvoiceResponse>;
  /** Call for ALL B2B invoices — Yesh determines SHAAM eligibility, not OpalSwift. */
  createITAAllocation(docnum: string): Promise<AllocationResponse>;
  captureJ5(tokenId: string, params: J5Params): Promise<ChargeResponse>;
  sendInvoiceSMS(docnum: string, phone: string): Promise<void>;
  getVATReport(month: string, tenantId: string): Promise<VATReport>;
  /** Step 1 of PCI-compliant card tokenisation: obtain short-lived requestToken for Yesh JS plugin. */
  addTokenSession(clientId: string): Promise<TokenSessionResponse>;
}

/**
 * IPaymentProvider — implemented by RapydAdapter (and MockRapydAdapter).
 * Adapter pattern mandate: only providerFor() may instantiate concrete adapters.
 */
export interface IPaymentProvider {
  createCheckout(amount: number, meta: PaymentMeta): Promise<CheckoutResponse>;
  handleWebhook(payload: WebhookPayload): Promise<PaymentResult>;
  createSubscription(plan: PlanParams): Promise<SubscriptionResponse>;
  chargeToken(customerId: string, amount: number): Promise<ChargeResponse>;
  issueRefund(paymentId: string, amount?: number): Promise<RefundResponse>;
}

// ── Error classes ────────────────────────────────────────────────────────────

export class InvoicingProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus?: number,
    public providerResponse?: unknown,
  ) {
    super(message);
    this.name = "InvoicingProviderError";
  }
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus?: number,
    public providerResponse?: unknown,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public provider: "yesh" | "rapyd",
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class WebhookError extends Error {
  constructor(
    message: string,
    public code: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = "WebhookError";
  }
}

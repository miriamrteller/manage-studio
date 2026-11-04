/**
 * Takbull HTTP client (https://api.takbull.co.il/ApiDocs, read 2026-11-04).
 *
 * Conventions from the docs:
 *  - **Auth:** every request carries the merchant's `API_Key` and `API_Secret` as HTTP
 *    headers. No token exchange, nothing to cache.
 *  - **Success flags differ by endpoint:** payment-page calls answer `responseCode: 0`;
 *    order calls (`ValidateNotification`, `ChargeToken`, `Refund`) answer `internalCode: 0`
 *    and may set `doNotRetry`; transactions answer `statusCode: 0`; account calls answer
 *    `Success` with `ErrorCode` 0 (or 1 for "created with the free package"). Each wrapper
 *    checks its own flag and throws TakbullApiError otherwise.
 *
 * Base URL from TAKBULL_API_BASE (default https://api.takbull.co.il). The sandbox uses
 * sandbox credentials from Takbull support. Tests inject `fetch`; nothing here reaches the
 * network on its own.
 */

const DEFAULT_BASE = "https://api.takbull.co.il";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface TakbullCredentials {
  apiKey: string;
  apiSecret: string;
}

export class TakbullApiError extends Error {
  constructor(
    message: string,
    readonly details: {
      endpoint: string;
      httpStatus?: number;
      code?: number;
      /** False when Takbull says not to retry, or the request itself was wrong. */
      retryable: boolean;
    },
  ) {
    super(message);
    this.name = "TakbullApiError";
  }
}

export function takbullApiBase(): string {
  const base = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get("TAKBULL_API_BASE")?.trim();
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

export interface TakbullClientOptions {
  credentials: TakbullCredentials;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// ── Request / response shapes (only the fields we use; Takbull may send more) ─────────────

/** DealType: 1 regular · 2 instalments · 4 recurring · 6 token/J2 · 7 suspended. */
export type TakbullDealType = 1 | 2 | 4 | 6 | 7;
/** PaymentMethodType on the page: 3 card (default) · 21 Bit. */
export type TakbullPageMethod = 3 | 21;

export interface TakbullProduct {
  SKU?: string;
  ProductName?: string;
  Description?: string;
  Price: number;
  Quantity: number;
  TaxAmount?: number;
  IsTaxteble?: boolean;
}

export interface TakbullCustomer {
  CustomerFullName?: string;
  Email?: string;
  PhoneNumber?: string;
  IdentityNumber?: string;
}

export interface TakbullOrderRequest {
  order_reference: string;
  OrderTotalSum: number;
  RedirectAddress: string;
  IPNAddress?: string;
  CancelReturnAddress?: string;
  DisplayType?: "iframe" | "redirect";
  PostProcessMethod?: "0" | "1";
  IsMobile?: boolean;
  CustomerFullName?: string;
  CustomerPhoneNumber?: string;
  Customer?: TakbullCustomer;
  DealType?: TakbullDealType;
  PaymentMethodType?: TakbullPageMethod;
  NumberOfPayments?: number;
  MaxNumberOfPayments?: number;
  CreateDocument?: boolean;
  DocumentType?: number;
  Language?: "he" | "en";
  Currency?: "ILS" | "USD" | "EUR";
  Products?: TakbullProduct[];
}

export interface TakbullRedirectUrlResult {
  uniqId: string;
  /** Bit on mobile: the deep link that opens the Bit app. */
  url?: string;
}

export interface TakbullValidation {
  internalCode: number;
  internalDescription?: string;
  doNotRetry?: boolean;
  isSubscriptionPayment?: boolean;
  saveToken?: boolean;
  documentId?: number;
  amount?: number;
  dealType?: number;
  orderStatus?: number;
  tranSactionStatus?: number;
}

export interface TakbullTransaction {
  transactionId?: string;
  amount: number;
  /** 10 charge · 20 refund · 30 cancellation · 60 token/J2 · 70 suspended. */
  transactionType?: number;
  currency?: string;
  /** 1 cash · 3 card · 11 PayPal · 21 Bit · 32 Apple Pay · 33 Google Pay. */
  paymentMethod?: number;
  numberOfPayments?: number;
  cardToken?: string;
  cardTokenExpirationMonth?: number;
  cardTokenExpirationYear?: number;
  last4DigitsCardNumber?: string;
  cardtype?: string;
  /** 1 approved · 2 declined · 3 partly refunded · 4 pending · 5 refunded · 6 failed. */
  status?: number;
  statusCode: number;
  isDocumentCreated?: boolean;
  invoiceUniqId?: string;
  documentNumber?: number;
}

/**
 * GetOrder (GET ?orderUniqId=). The docs list these fields among others; orderStatus uses the
 * order table: 0 pending · 1 failed · 2 processing · 3 completed · 4 on hold · 5 cancelled ·
 * 6 refunded · 7 removed · 8 resubmit · 9 abandoned.
 */
export interface TakbullOrder {
  uniqId?: string;
  orderStatus?: number;
  order_reference?: string;
  orderTotalSum?: number;
  transactions?: Array<{ transactionId?: string; amount?: number; status?: number }>;
}

/** ChargeToken's answer (docs example): orderId is Takbull's number for the order it made. */
export interface TakbullChargeTokenResult extends TakbullValidation {
  orderId?: number;
  providerCode?: number;
}

export interface TakbullChargeTokenRequest
  extends Omit<TakbullOrderRequest, "RedirectAddress" | "DisplayType" | "PostProcessMethod" | "IsMobile" | "PaymentMethodType"> {
  RedirectAddress?: string;
  CreditCard: { CardExternalToken: string };
}

/** RefundType: 1 cancel only · 2 cancel with document · 3 partial · 4 partial with document. */
export interface TakbullRefundRequest {
  RefundType: 1 | 2 | 3 | 4;
  RefundAmount?: number | null;
  TransactionInternalNumber: string;
  Comments?: string;
}

export interface TakbullDocumentRequest {
  documentType: number;
  invoiceItems: Array<{ description: string; unitPrice: number; quantity: number; isTaxteble?: boolean; totalPrice?: number }>;
  customerVM: { customerFullName: string; email?: string; phoneNumber?: string; identityNumber?: string };
  sendToCustomer: boolean;
  documentDate?: string;
  currency?: string;
  language?: "he" | "en";
  isItemIncludeTax?: boolean;
  isNegativeDocument?: boolean;
  totalPriceWithTax?: number;
  cashes?: Array<{ description?: string; amount: number }>;
  wireTransfers?: Array<{ amount: number; bankNumber?: string; bankBranch?: string; accountNumber?: string }>;
  customPayments?: Array<{ methodName?: string; amount: number; creationDate: string; referanceId?: string }>;
  comments?: string;
}

export interface TakbullDocumentResult {
  documentNumber: number;
  documentVM?: { id?: number; documentNumber?: number; documentType?: number; uniqId?: string };
}

export interface TakbullDocumentSettings {
  DefaultDocumentType?: number;
  IsTaxtable?: boolean;
  IsItemIncludeTax?: boolean;
  EmailFromDisplayName?: string;
  EmaiSubjectMsg?: string;
  EmailBodyMsg?: string;
  [key: string]: unknown;
}

/** What a studio's Takbull account can do, behind one interface (live client or the mock). */
export interface TakbullApi {
  getPaymentPageRedirectUrl(order: TakbullOrderRequest): Promise<TakbullRedirectUrlResult>;
  validateNotification(uniqId: string): Promise<TakbullValidation>;
  getTransaction(transactionInternalNumber: string): Promise<TakbullTransaction>;
  getOrder(orderUniqId: string): Promise<TakbullOrder>;
  chargeToken(request: TakbullChargeTokenRequest): Promise<TakbullChargeTokenResult>;
  refund(request: TakbullRefundRequest): Promise<TakbullValidation>;
  createDocument(request: TakbullDocumentRequest): Promise<TakbullDocumentResult>;
  getDocumentSettings(params?: { childMid?: string; lang?: "he" | "en" }): Promise<TakbullDocumentSettings>;
  updateDocumentSettings(params: {
    childMid?: string;
    language?: "he" | "en";
    settings: TakbullDocumentSettings;
  }): Promise<TakbullDocumentSettings>;
}

/** The URL a client is sent to (or the iframe opens) for an order. */
export function takbullPaymentPageUrl(uniqId: string, baseUrl = takbullApiBase()): string {
  return `${baseUrl}/PaymentGateway?orderUniqId=${encodeURIComponent(uniqId)}`;
}

// ── Live client ──────────────────────────────────────────────────────────────────────────

export class TakbullClient implements TakbullApi {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: TakbullClientOptions) {
    this.base = (options.baseUrl ?? takbullApiBase()).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** One call: headers, timeout, JSON, and HTTP errors (5xx / network / timeout retryable). */
  private async call<T>(endpoint: string, init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> }): Promise<T> {
    const url = new URL(`${this.base}/${endpoint}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method: init.method,
        headers: {
          "Content-Type": "application/json",
          API_Key: this.options.credentials.apiKey,
          API_Secret: this.options.credentials.apiSecret,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      throw new TakbullApiError(timedOut ? `Takbull ${endpoint} timed out` : `Takbull ${endpoint} unreachable`, {
        endpoint,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (!res.ok) {
      throw new TakbullApiError(`Takbull ${endpoint} HTTP ${res.status}`, {
        endpoint,
        httpStatus: res.status,
        // Bad request / auth: retrying the same call won't help.
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new TakbullApiError(`Takbull ${endpoint} returned a non-JSON response`, {
        endpoint,
        httpStatus: res.status,
        retryable: false,
      });
    }
  }

  async getPaymentPageRedirectUrl(order: TakbullOrderRequest): Promise<TakbullRedirectUrlResult> {
    const endpoint = "api/ExtranalAPI/GetTakbullPaymentPageRedirectUrl";
    const r = await this.call<{ responseCode?: number; uniqId?: string; url?: string; description?: string }>(endpoint, {
      method: "POST",
      body: order,
    });
    if (r.responseCode !== 0 || !r.uniqId) {
      throw new TakbullApiError(r.description || `Takbull ${endpoint} failed (${r.responseCode})`, {
        endpoint,
        code: r.responseCode,
        retryable: false,
      });
    }
    return { uniqId: r.uniqId, ...(r.url ? { url: r.url } : {}) };
  }

  async validateNotification(uniqId: string): Promise<TakbullValidation> {
    // Not thrown on a non-zero code: an IPN check that says "invalid" is an answer, not a fault.
    return await this.call<TakbullValidation>("api/ExtranalAPI/ValidateNotification", {
      method: "POST",
      body: { uniqId },
    });
  }

  async getTransaction(transactionInternalNumber: string): Promise<TakbullTransaction> {
    return await this.call<TakbullTransaction>("api/ExtranalAPI/GetTransaction", {
      method: "GET",
      query: { transactionInternalNumber },
    });
  }

  async getOrder(orderUniqId: string): Promise<TakbullOrder> {
    return await this.call<TakbullOrder>("api/ExtranalAPI/GetOrder", {
      method: "GET",
      query: { orderUniqId },
    });
  }

  async chargeToken(request: TakbullChargeTokenRequest): Promise<TakbullChargeTokenResult> {
    return this.orderCall("api/ExtranalAPI/ChargeToken", request);
  }

  async refund(request: TakbullRefundRequest): Promise<TakbullValidation> {
    return this.orderCall("api/ExtranalAPI/Refund", request);
  }

  private async orderCall<T extends TakbullValidation = TakbullValidation>(endpoint: string, body: unknown): Promise<T> {
    const r = await this.call<T>(endpoint, { method: "POST", body });
    if (r.internalCode !== 0) {
      throw new TakbullApiError(r.internalDescription || `Takbull ${endpoint} failed (${r.internalCode})`, {
        endpoint,
        code: r.internalCode,
        retryable: r.doNotRetry !== true,
      });
    }
    return r;
  }

  async createDocument(request: TakbullDocumentRequest): Promise<TakbullDocumentResult> {
    const endpoint = "api/DocumentApi/Create";
    const r = await this.call<{
      responseCode?: number;
      isOk?: boolean;
      documentNumber?: number;
      errorList?: unknown[];
      documentVM?: TakbullDocumentResult["documentVM"];
    }>(endpoint, { method: "POST", body: request });
    if (r.responseCode !== 0 || r.isOk === false || r.documentNumber == null) {
      throw new TakbullApiError(`Takbull ${endpoint} failed (${r.responseCode}): ${JSON.stringify(r.errorList ?? [])}`, {
        endpoint,
        code: r.responseCode,
        retryable: false,
      });
    }
    return { documentNumber: r.documentNumber, documentVM: r.documentVM };
  }

  async getDocumentSettings(params: { childMid?: string; lang?: "he" | "en" } = {}): Promise<TakbullDocumentSettings> {
    const query: Record<string, string> = { lang: params.lang ?? "he" };
    if (params.childMid) query.childMid = params.childMid;
    return this.accountCall("api/Account/GetDocumentSettings", { method: "GET", query });
  }

  async updateDocumentSettings(params: {
    childMid?: string;
    language?: "he" | "en";
    settings: TakbullDocumentSettings;
  }): Promise<TakbullDocumentSettings> {
    return this.accountCall("api/Account/UpdateDocumentSettings", {
      method: "POST",
      body: {
        ...(params.childMid ? { ChildMid: params.childMid } : {}),
        Language: params.language ?? "he",
        Settings: params.settings,
      },
    });
  }

  private async accountCall(
    endpoint: string,
    init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> },
  ): Promise<TakbullDocumentSettings> {
    const r = await this.call<{ Success?: boolean; ErrorCode?: number; ErrorMessage?: string | null; Settings?: TakbullDocumentSettings }>(
      endpoint,
      init,
    );
    if (r.Success !== true || (r.ErrorCode !== 0 && r.ErrorCode !== undefined)) {
      throw new TakbullApiError(r.ErrorMessage || `Takbull ${endpoint} failed (${r.ErrorCode})`, {
        endpoint,
        code: r.ErrorCode,
        // 600104: the keys don't identify a merchant — wrong keys, not a passing fault.
        retryable: false,
      });
    }
    return r.Settings ?? {};
  }
}

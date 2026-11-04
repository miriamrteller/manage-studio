import { TakbullApiError } from "./client.ts";
import type {
  TakbullApi,
  TakbullChargeTokenRequest,
  TakbullChargeTokenResult,
  TakbullDocumentRequest,
  TakbullDocumentResult,
  TakbullDocumentSettings,
  TakbullOrder,
  TakbullOrderRequest,
  TakbullRedirectUrlResult,
  TakbullRefundRequest,
  TakbullTransaction,
  TakbullValidation,
} from "./client.ts";

/**
 * In-memory Takbull for tests and dev (TAKBULL_MOCK=true; never set in prod, see
 * supabase/edge-secrets.json). Same interface as the live client; it never reaches the
 * network. Keys starting with "invalid" are refused, so "Test connection" can be tried, and
 * saved cards starting with "declined" are declined, so dunning can be tried.
 */
export class MockTakbullApi implements TakbullApi {
  private seq = 0;
  readonly orders = new Map<string, TakbullOrderRequest & { transactionInternalNumber: string }>();
  readonly transactions = new Map<string, TakbullTransaction>();
  readonly documents: TakbullDocumentRequest[] = [];
  readonly refunds: TakbullRefundRequest[] = [];
  readonly tokenCharges: TakbullChargeTokenRequest[] = [];
  private settings: TakbullDocumentSettings = { DefaultDocumentType: 320, IsItemIncludeTax: true };

  constructor(private readonly apiKey: string = "mock") {}

  private next(): string {
    this.seq += 1;
    return String(this.seq).padStart(9, "0");
  }

  private checkKeys(): void {
    if (this.apiKey.startsWith("invalid")) {
      throw Object.assign(new Error("Could not resolve the authenticated merchant identity"), { code: 600104 });
    }
  }

  getPaymentPageRedirectUrl(order: TakbullOrderRequest): Promise<TakbullRedirectUrlResult> {
    this.checkKeys();
    const uniqId = crypto.randomUUID();
    const transactionInternalNumber = this.next();
    this.orders.set(uniqId, { ...order, transactionInternalNumber });
    this.transactions.set(transactionInternalNumber, {
      transactionId: transactionInternalNumber,
      amount: order.OrderTotalSum,
      transactionType: 10,
      currency: order.Currency ?? "ILS",
      paymentMethod: order.PaymentMethodType ?? 3,
      numberOfPayments: order.NumberOfPayments ?? 1,
      cardToken: `mock-token-${uniqId.slice(0, 8)}`,
      cardTokenExpirationMonth: 12,
      cardTokenExpirationYear: 30,
      last4DigitsCardNumber: "4242",
      status: 1,
      statusCode: 0,
      isDocumentCreated: order.CreateDocument === true,
      ...(order.CreateDocument ? { invoiceUniqId: crypto.randomUUID(), documentNumber: 40000 + this.seq } : {}),
    });
    return Promise.resolve({
      uniqId,
      ...(order.PaymentMethodType === 21 && order.IsMobile ? { url: `bit://mock/${uniqId}` } : {}),
    });
  }

  validateNotification(uniqId: string): Promise<TakbullValidation> {
    const order = this.orders.get(uniqId);
    if (!order) return Promise.resolve({ internalCode: 1400101, internalDescription: "INVALID" });
    return Promise.resolve({ internalCode: 0, internalDescription: "OK", amount: order.OrderTotalSum, orderStatus: 3 });
  }

  getTransaction(transactionInternalNumber: string): Promise<TakbullTransaction> {
    const t = this.transactions.get(transactionInternalNumber);
    return Promise.resolve(t ?? { amount: 0, statusCode: 1, status: 6 });
  }

  /** The order a mock payment page created, for tests to build the IPN from. */
  transactionNumberFor(uniqId: string): string | undefined {
    return this.orders.get(uniqId)?.transactionInternalNumber;
  }

  getOrder(orderUniqId: string): Promise<TakbullOrder> {
    const order = this.orders.get(orderUniqId);
    if (!order) return Promise.resolve({});
    return Promise.resolve({
      uniqId: orderUniqId,
      orderStatus: 3,
      order_reference: order.order_reference,
      orderTotalSum: order.OrderTotalSum,
      transactions: [{ transactionId: order.transactionInternalNumber, amount: order.OrderTotalSum, status: 1 }],
    });
  }

  chargeToken(request: TakbullChargeTokenRequest): Promise<TakbullChargeTokenResult> {
    this.checkKeys();
    this.tokenCharges.push(request);
    if (request.CreditCard.CardExternalToken.startsWith("declined")) {
      return Promise.reject(
        new TakbullApiError("Card declined", { endpoint: "api/ExtranalAPI/ChargeToken", code: 33, retryable: false }),
      );
    }
    // The charge makes an order of its own; its notice names it (uniqId) and the transaction.
    const uniqId = crypto.randomUUID();
    const transactionInternalNumber = this.next();
    this.orders.set(uniqId, { ...request, RedirectAddress: request.RedirectAddress ?? "", transactionInternalNumber });
    this.transactions.set(transactionInternalNumber, {
      transactionId: transactionInternalNumber,
      amount: request.OrderTotalSum,
      transactionType: 10,
      currency: request.Currency ?? "ILS",
      paymentMethod: 3,
      numberOfPayments: 1,
      status: 1,
      statusCode: 0,
      isDocumentCreated: request.CreateDocument === true,
      ...(request.CreateDocument ? { invoiceUniqId: crypto.randomUUID(), documentNumber: 40000 + this.seq } : {}),
    });
    this.lastTokenOrder = { uniqId, transactionInternalNumber };
    return Promise.resolve({ internalCode: 0, internalDescription: "OK", orderId: this.seq, orderStatus: 0 });
  }

  /** The order the last saved-card charge made, for tests (and dev) to build its notice from. */
  lastTokenOrder: { uniqId: string; transactionInternalNumber: string } | null = null;

  refund(request: TakbullRefundRequest): Promise<TakbullValidation> {
    this.checkKeys();
    this.refunds.push(request);
    return Promise.resolve({ internalCode: 0, internalDescription: "OK" });
  }

  createDocument(request: TakbullDocumentRequest): Promise<TakbullDocumentResult> {
    this.checkKeys();
    this.documents.push(request);
    const documentNumber = 50000 + this.documents.length;
    return Promise.resolve({
      documentNumber,
      documentVM: { id: documentNumber, documentNumber, documentType: request.documentType, uniqId: crypto.randomUUID() },
    });
  }

  getDocumentSettings(): Promise<TakbullDocumentSettings> {
    this.checkKeys();
    return Promise.resolve({ ...this.settings });
  }

  updateDocumentSettings(params: { settings: TakbullDocumentSettings }): Promise<TakbullDocumentSettings> {
    this.checkKeys();
    this.settings = { ...this.settings, ...params.settings };
    return Promise.resolve({ ...this.settings });
  }
}

/**
 * Dev / CI only (TAKBULL_MOCK): an account that confirms one known order, so the notice for a
 * payment created in an earlier request settles (the in-memory mock forgets between requests).
 */
export function mockTakbullApproving(order: {
  uniqId: string;
  amountMinor: number;
  currency: string;
  /** Our payment id, which a saved-card order's GetOrder must name. */
  orderReference?: string;
}): MockTakbullApi {
  const api = new MockTakbullApi();
  api.orders.set(order.uniqId, {
    order_reference: order.orderReference ?? "mock",
    OrderTotalSum: order.amountMinor / 100,
    RedirectAddress: "",
    transactionInternalNumber: "mock",
  });
  const tx = {
    transactionId: "mock",
    amount: order.amountMinor / 100,
    transactionType: 10,
    currency: order.currency,
    paymentMethod: 3,
    cardToken: `mock-token-${order.uniqId.slice(0, 8)}`,
    cardTokenExpirationMonth: 12,
    cardTokenExpirationYear: 30,
    last4DigitsCardNumber: "4242",
    status: 1,
    statusCode: 0,
    isDocumentCreated: false,
  };
  api.getTransaction = () => Promise.resolve(tx);
  return api;
}

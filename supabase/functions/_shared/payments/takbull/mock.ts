import type {
  TakbullApi,
  TakbullChargeTokenRequest,
  TakbullDocumentRequest,
  TakbullDocumentResult,
  TakbullDocumentSettings,
  TakbullOrderRequest,
  TakbullRedirectUrlResult,
  TakbullRefundRequest,
  TakbullTransaction,
  TakbullValidation,
} from "./client.ts";

/**
 * In-memory Takbull for tests and dev (TAKBULL_MOCK=true; never set in prod, see
 * supabase/edge-secrets.json). Same interface as the live client; it never reaches the
 * network. Keys starting with "invalid" are refused, so "Test connection" can be tried.
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

  chargeToken(request: TakbullChargeTokenRequest): Promise<TakbullValidation> {
    this.checkKeys();
    this.tokenCharges.push(request);
    return Promise.resolve({ internalCode: 0, internalDescription: "OK" });
  }

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

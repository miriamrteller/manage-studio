/**
 * Takbull PR 1: the HTTP client (headers, endpoints, each endpoint's own success flag,
 * retryable vs not), the in-memory mock, and "Test connection". Fake fetch only: nothing
 * reaches Takbull.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TakbullApiError,
  TakbullClient,
  takbullPaymentPageUrl,
} from '../../../../supabase/functions/_shared/payments/takbull/client';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import { verifyTakbullConnection } from '../../../../supabase/functions/_shared/payments/takbull/verify';
import { getTakbullCredentials, TakbullNotConnectedError } from '../../../../supabase/functions/_shared/payments/takbull/credentials';

const credentials = { apiKey: 'key-1', apiSecret: 'secret-1' };

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<(url: string, init?: FetchInit) => Promise<Response>>(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

function client(fetchImpl: ReturnType<typeof fakeFetch>) {
  return new TakbullClient({ credentials, baseUrl: 'https://tb.test/', fetch: fetchImpl as unknown as typeof fetch });
}

describe('Takbull client', () => {
  it('sends the merchant keys as headers to the documented endpoint', async () => {
    const f = fakeFetch({ responseCode: 0, uniqId: 'u-1' });
    const result = await client(f).getPaymentPageRedirectUrl({ order_reference: 'p-1', OrderTotalSum: 150.5, RedirectAddress: 'https://x/ok' });
    expect(result).toEqual({ uniqId: 'u-1' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://tb.test/api/ExtranalAPI/GetTakbullPaymentPageRedirectUrl');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ API_Key: 'key-1', API_Secret: 'secret-1', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ order_reference: 'p-1', OrderTotalSum: 150.5, RedirectAddress: 'https://x/ok' });
    expect(takbullPaymentPageUrl('u 1', 'https://tb.test')).toBe('https://tb.test/PaymentGateway?orderUniqId=u%201');
  });

  it('checks each endpoint by its own success flag', async () => {
    await expect(client(fakeFetch({ responseCode: 3, description: 'Bad sum' })).getPaymentPageRedirectUrl({
      order_reference: 'p', OrderTotalSum: 1, RedirectAddress: 'https://x',
    })).rejects.toThrow('Bad sum');

    // ChargeToken / Refund: internalCode, with doNotRetry deciding retryable.
    const declined = await client(fakeFetch({ internalCode: 51, internalDescription: 'Declined', doNotRetry: true }))
      .chargeToken({ order_reference: 'p', OrderTotalSum: 1, CreditCard: { CardExternalToken: 't' } })
      .catch((e: unknown) => e);
    expect(declined).toBeInstanceOf(TakbullApiError);
    expect((declined as TakbullApiError).details).toMatchObject({ code: 51, retryable: false });
    await expect(client(fakeFetch({ internalCode: 0 })).refund({ RefundType: 4, RefundAmount: 50, TransactionInternalNumber: '000125685' }))
      .resolves.toMatchObject({ internalCode: 0 });

    // Account calls: Success + ErrorCode.
    await expect(client(fakeFetch({ Success: false, ErrorCode: 600104, ErrorMessage: 'Could not resolve merchant' })).getDocumentSettings())
      .rejects.toThrow('Could not resolve merchant');

    // ValidateNotification: a non-zero code is an answer, not a fault.
    await expect(client(fakeFetch({ internalCode: 1400101, internalDescription: 'INVALID' })).validateNotification('u'))
      .resolves.toMatchObject({ internalCode: 1400101 });
  });

  it('GET calls put their parameters in the query string', async () => {
    const f = fakeFetch({ amount: 210.1, statusCode: 0, cardToken: 'tok' });
    await client(f).getTransaction('000000164');
    expect(f.mock.calls[0][0]).toBe('https://tb.test/api/ExtranalAPI/GetTransaction?transactionInternalNumber=000000164');
    expect(f.mock.calls[0][1]?.method).toBe('GET');
    const g = fakeFetch({ Success: true, ErrorCode: 0, Settings: { DefaultDocumentType: 400 } });
    await expect(client(g).getDocumentSettings({ childMid: 'MID_1', lang: 'en' })).resolves.toEqual({ DefaultDocumentType: 400 });
    expect(g.mock.calls[0][0]).toBe('https://tb.test/api/Account/GetDocumentSettings?lang=en&childMid=MID_1');
  });

  it('server errors and network failures are retryable; bad requests and non-JSON are not', async () => {
    const e500 = await client(fakeFetch('oops', 503)).validateNotification('u').catch((e: unknown) => e) as TakbullApiError;
    expect(e500.details).toMatchObject({ httpStatus: 503, retryable: true });
    const e400 = await client(fakeFetch('bad', 401)).validateNotification('u').catch((e: unknown) => e) as TakbullApiError;
    expect(e400.details).toMatchObject({ httpStatus: 401, retryable: false });
    const net = vi.fn(async () => { throw new TypeError('network down'); });
    const eNet = await client(net as never).validateNotification('u').catch((e: unknown) => e) as TakbullApiError;
    expect(eNet.details.retryable).toBe(true);
    const eHtml = await client(fakeFetch('<html>')).validateNotification('u').catch((e: unknown) => e) as TakbullApiError;
    expect(eHtml.details.retryable).toBe(false);
  });

  it('createDocument needs responseCode 0 and a document number', async () => {
    const ok = fakeFetch({ responseCode: 0, isOk: true, documentNumber: 45325, documentVM: { id: 1, documentType: 400 } });
    await expect(client(ok).createDocument({
      documentType: 400, invoiceItems: [{ description: 'x', unitPrice: 100, quantity: 1 }],
      customerVM: { customerFullName: 'Dana' }, sendToCustomer: false, cashes: [{ amount: 100 }],
    })).resolves.toMatchObject({ documentNumber: 45325 });
    await expect(client(fakeFetch({ responseCode: 1, isOk: false, errorList: ['no items'] })).createDocument({
      documentType: 400, invoiceItems: [], customerVM: { customerFullName: 'Dana' }, sendToCustomer: false,
    })).rejects.toThrow(/no items/);
  });
});

describe('mock and Test connection', () => {
  it('the mock creates an order whose IPN validates, with a card token and a document', async () => {
    const mock = new MockTakbullApi();
    const { uniqId } = await mock.getPaymentPageRedirectUrl({ order_reference: 'p', OrderTotalSum: 100, RedirectAddress: 'https://x', CreateDocument: true });
    await expect(mock.validateNotification(uniqId)).resolves.toMatchObject({ internalCode: 0, amount: 100 });
    await expect(mock.validateNotification('unknown')).resolves.toMatchObject({ internalCode: 1400101 });
    const tx = await mock.getTransaction(mock.transactionNumberFor(uniqId)!);
    expect(tx).toMatchObject({ statusCode: 0, amount: 100, isDocumentCreated: true });
    expect(tx.cardToken).toBeTruthy();
  });

  it('Test connection: valid keys pass with the default document type; refused keys say why', async () => {
    await expect(verifyTakbullConnection(new MockTakbullApi('key'))).resolves.toEqual({ valid: true, defaultDocumentType: 320 });
    const bad = await verifyTakbullConnection(new MockTakbullApi('invalid-key'));
    expect(bad.valid).toBe(false);
    expect(bad.message).toMatch(/merchant/);
  });

  it('a studio with no keys saved is "not connected"', async () => {
    const service = { rpc: vi.fn(async () => ({ data: [], error: null })) };
    await expect(getTakbullCredentials(service as never, 't-1')).rejects.toBeInstanceOf(TakbullNotConnectedError);
    const saved = { rpc: vi.fn(async () => ({ data: [{ api_key: ' k ', api_secret: ' s ' }], error: null })) };
    await expect(getTakbullCredentials(saved as never, 't-1')).resolves.toEqual({ apiKey: 'k', apiSecret: 's' });
    expect(saved.rpc).toHaveBeenCalledWith('get_tenant_takbull_credentials', { p_tenant_id: 't-1' });
  });
});

/**
 * Photographer beta B: money actions from the panel go through edge functions
 * (never a direct payments insert), the refund is flagged manual (YPay has no
 * refund API), and the quote → requests RPC contract matches Thread C.
 * Run: pnpm -C apps/web test job-payment-service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobPaymentService } from '@/features/jobs/services/jobPaymentService';

const mockInvoke = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('JobPaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { ok: true, paymentId: 'pay-1', recipientEmail: 'c@x.test', paymentUrl: 'u' }, error: null });
    mockRpc.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
  });

  it('records a manual payment through record-job-payment', async () => {
    await JobPaymentService.recordManualPayment('req-1', 'cash', 'paid at shoot');
    expect(mockInvoke).toHaveBeenCalledWith('record-job-payment', {
      body: { request_id: 'req-1', method: 'cash', note: 'paid at shoot' },
    });
  });

  it('records a manual refund via process-refund with manual: true', async () => {
    await JobPaymentService.recordManualRefund('pay-1', 'client cancelled');
    expect(mockInvoke).toHaveBeenCalledWith('process-refund', {
      body: { payment_id: 'pay-1', reason: 'client cancelled', manual: true },
    });
  });

  it('sends the pay link through send-job-payment-link', async () => {
    const res = await JobPaymentService.sendLink('req-1');
    expect(mockInvoke).toHaveBeenCalledWith('send-job-payment-link', { body: { request_id: 'req-1' } });
    expect(res.recipientEmail).toBe('c@x.test');
  });

  it('creates requests with the create_job_payment_requests RPC contract', async () => {
    await JobPaymentService.create('eng-1', [
      { label: ' מקדמה ', amount_minor: 15000, due_date: '2026-11-03' },
      { label: 'יתרה', amount_minor: 30000, due_date: '2026-11-10', max_installments: 3 },
    ]);
    expect(mockRpc).toHaveBeenCalledWith('create_job_payment_requests', {
      p_engagement_id: 'eng-1',
      p_requests: [
        { label: 'מקדמה', amount_minor: 15000, due_date: '2026-11-03', max_installments: 1 },
        { label: 'יתרה', amount_minor: 30000, due_date: '2026-11-10', max_installments: 3 },
      ],
    });
  });

  it('surfaces edge-function errors', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Request is paid' }, error: null });
    await expect(JobPaymentService.recordManualPayment('req-1', 'cash')).rejects.toThrow('Request is paid');
  });

  it('public pay page calls job-payment-request-public with the token', async () => {
    mockInvoke.mockResolvedValue({ data: { request: { id: 'r' }, pageUrl: 'https://pay' }, error: null });
    const res = await JobPaymentService.publicRequest('a'.repeat(48), 'create_charge');
    expect(mockInvoke).toHaveBeenCalledWith('job-payment-request-public', {
      body: { token: 'a'.repeat(48), action: 'create_charge' },
    });
    expect(res.pageUrl).toBe('https://pay');
  });
});

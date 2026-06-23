/**
 * G2: the finance walkthrough pipeline summarizer must map raw rows to a single stage.
 * Run: pnpm -C apps/web test walkthroughPipeline.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  summarizePipeline,
  type PipelinePaymentRow,
} from '@/features/finance/lib/walkthroughPipeline';

const paidPayment: PipelinePaymentRow = {
  id: 'pay-1',
  status: 'succeeded',
  charge_type: 'initial',
  total_amount_minor: 35000,
  currency: 'ILS',
  external_document_id: null,
  external_document_number: null,
  invoice_url: null,
};

describe('summarizePipeline', () => {
  it('reports no_engagement when the engagement is missing', () => {
    const summary = summarizePipeline({
      engagementStatus: null,
      payment: null,
      queue: null,
      lastEmailAction: null,
    });
    expect(summary.stage).toBe('no_engagement');
  });

  it('reports awaiting_payment when there is no payment row', () => {
    const summary = summarizePipeline({
      engagementStatus: 'pending_payment',
      payment: null,
      queue: null,
      lastEmailAction: null,
    });
    expect(summary.stage).toBe('awaiting_payment');
  });

  it('reports paid_no_document when paid but no queue or document', () => {
    const summary = summarizePipeline({
      engagementStatus: 'active',
      payment: paidPayment,
      queue: null,
      lastEmailAction: null,
    });
    expect(summary.stage).toBe('paid_no_document');
    expect(summary.paymentStatus).toBe('succeeded');
  });

  it('reports document_pending while the queue row is pending', () => {
    const summary = summarizePipeline({
      engagementStatus: 'active',
      payment: paidPayment,
      queue: { status: 'pending', attempts: 0, last_error: null },
      lastEmailAction: 'payment_confirmation_email_sent',
    });
    expect(summary.stage).toBe('document_pending');
    expect(summary.lastEmailAction).toBe('payment_confirmation_email_sent');
  });

  it('reports document_failed when the queue row failed', () => {
    const summary = summarizePipeline({
      engagementStatus: 'active',
      payment: paidPayment,
      queue: { status: 'failed', attempts: 3, last_error: 'provider error' },
      lastEmailAction: null,
    });
    expect(summary.stage).toBe('document_failed');
  });

  it('reports complete once the external document is set', () => {
    const summary = summarizePipeline({
      engagementStatus: 'active',
      payment: {
        ...paidPayment,
        external_document_id: 'doc-1',
        external_document_number: 'INV-1001',
        invoice_url: 'https://example.com/doc-1',
      },
      queue: { status: 'succeeded', attempts: 1, last_error: null },
      lastEmailAction: 'payment_confirmation_email_sent',
    });
    expect(summary.stage).toBe('complete');
    expect(summary.documentIssued).toBe(true);
    expect(summary.documentNumber).toBe('INV-1001');
  });
});

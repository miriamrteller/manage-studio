import { describe, it, expect } from 'vitest';
import { PaymentLogRowSchema } from '@shared/schemas';
import { getProviderLabelKey } from '@/features/finance-admin/services/paymentsLogService';
import {
  getCaptureSourceLabelKey,
  getPaymentCaptureSource,
  isRefundRow,
} from '@/features/finance-admin/lib/paymentsLogDisplay';

describe('payments-log', () => {
  it('parses PaymentLogRow with nested person and offering', () => {
    const row = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      person_id: '550e8400-e29b-41d4-a716-446655440001',
      pretax_amount_minor: 1000,
      vat_amount_minor: 170,
      total_amount_minor: 1170,
      currency: 'ILS',
      status: 'succeeded',
      charge_type: 'initial',
      provider: 'manual',
      created_at: '2026-06-01T10:00:00Z',
      person: { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Ruti' },
      offering: { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Ballet 1' },
    };
    const parsed = PaymentLogRowSchema.parse(row);
    expect(parsed.person?.name).toBe('Ruti');
    expect(parsed.offering?.name).toBe('Ballet 1');
  });

  it('detects refund rows with negative totals', () => {
    expect(
      isRefundRow({ charge_type: 'refund', total_amount_minor: -500 }),
    ).toBe(true);
  });

  it('maps manual provider to manual capture source', () => {
    expect(getPaymentCaptureSource('manual')).toBe('manual');
    expect(getCaptureSourceLabelKey('manual')).toBe('finance.capture_source.manual');
  });

  it('maps gateway providers to online capture source', () => {
    for (const provider of ['grow', 'stripe', 'mock']) {
      expect(getPaymentCaptureSource(provider)).toBe('online');
    }
    expect(getCaptureSourceLabelKey('online')).toBe('finance.capture_source.online');
  });

  it('maps gateway slug to i18n key for detail drawer', () => {
    expect(getProviderLabelKey('grow')).toBe('finance.provider.grow');
  });
});

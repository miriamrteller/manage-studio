/**
 * Provider isolation — triple mock env (GROW_MOCK + ICOUNT_MOCK + INVOICE4U_MOCK)
 * and confirm-mock eligibility.
 * Run: pnpm -C apps/web test provider-isolation-mock.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getPaymentProvider } from '../../../../supabase/functions/_shared/payments/index.ts';
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import { MockInvoice4uPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-invoice4u.ts';
import { resolveMockConfirmEligibility } from '../../../../supabase/functions/_shared/payments/mock-confirm-eligibility.ts';

const dualMockEnv = { growMock: 'true', icountMock: 'true' };
const tripleMockEnv = { growMock: 'true', icountMock: 'true', invoice4uMock: 'true' };

describe('factory isolation with both mocks enabled (I1-T3, I1-T4)', () => {
  const service = {} as never;

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
    delete process.env.INVOICE4U_MOCK;
  });

  it('returns MockGrow for grow slug, not MockIcount', () => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    const provider = getPaymentProvider(service, 'grow');
    expect(provider).toBeInstanceOf(MockGrowPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockIcountPaymentProvider);
  });

  it('returns MockIcount for icount slug, not MockGrow', () => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    const provider = getPaymentProvider(service, 'icount');
    expect(provider).toBeInstanceOf(MockIcountPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockGrowPaymentProvider);
  });
});

describe('factory isolation with triple mocks enabled (U1)', () => {
  const service = {} as never;

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
    delete process.env.INVOICE4U_MOCK;
  });

  it('returns MockInvoice4u for invoice4u slug only', () => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    process.env.INVOICE4U_MOCK = 'true';
    const provider = getPaymentProvider(service, 'invoice4u');
    expect(provider).toBeInstanceOf(MockInvoice4uPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockGrowPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockIcountPaymentProvider);
  });

  it('keeps grow and icount mocks isolated when invoice4u mock is on', () => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    process.env.INVOICE4U_MOCK = 'true';
    expect(getPaymentProvider(service, 'grow')).toBeInstanceOf(MockGrowPaymentProvider);
    expect(getPaymentProvider(service, 'icount')).toBeInstanceOf(MockIcountPaymentProvider);
  });
});

describe('resolveMockConfirmEligibility (I1-T6, I1-T7, I1-T8, U1)', () => {
  it('allows icount tenant when ICOUNT_MOCK=true', () => {
    expect(resolveMockConfirmEligibility('icount', dualMockEnv)).toEqual({
      ok: true,
      providerSlug: 'icount',
    });
  });

  it('rejects icount tenant when only GROW_MOCK=true', () => {
    expect(resolveMockConfirmEligibility('icount', { growMock: 'true' })).toEqual({ ok: false });
  });

  it('rejects grow tenant when only ICOUNT_MOCK=true', () => {
    expect(resolveMockConfirmEligibility('grow', { icountMock: 'true' })).toEqual({ ok: false });
  });

  it('allows grow tenant when GROW_MOCK=true', () => {
    expect(resolveMockConfirmEligibility('grow', { growMock: 'true' })).toEqual({
      ok: true,
      providerSlug: 'grow',
    });
  });

  it('maps icount eligibility to providerSlug icount for confirm-mock-payment (I1-T6)', () => {
    const result = resolveMockConfirmEligibility('icount', { icountMock: 'true' });
    expect(result).toEqual({ ok: true, providerSlug: 'icount' });
  });

  it('allows invoice4u tenant when INVOICE4U_MOCK=true', () => {
    expect(resolveMockConfirmEligibility('invoice4u', tripleMockEnv)).toEqual({
      ok: true,
      providerSlug: 'invoice4u',
    });
  });

  it('rejects invoice4u tenant when only GROW_MOCK=true', () => {
    expect(resolveMockConfirmEligibility('invoice4u', { growMock: 'true' })).toEqual({
      ok: false,
    });
  });
});

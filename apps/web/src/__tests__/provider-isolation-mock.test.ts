/**
 * I1 provider isolation — dual mock env (GROW_MOCK + ICOUNT_MOCK) and confirm-mock eligibility.
 * Run: pnpm -C apps/web test provider-isolation-mock.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getPaymentProvider } from '../../../../supabase/functions/_shared/payments/index.ts';
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import { resolveMockConfirmEligibility } from '../../../../supabase/functions/_shared/payments/mock-confirm-eligibility.ts';

const dualMockEnv = { growMock: 'true', icountMock: 'true' };

describe('factory isolation with both mocks enabled (I1-T3, I1-T4)', () => {
  const service = {} as never;

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
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

describe('resolveMockConfirmEligibility (I1-T6, I1-T7, I1-T8)', () => {
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
});

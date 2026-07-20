/**
 * I3-T3, I3-T4 — hosted checkout readiness and mock page detection by slug.
 */
import { describe, it, expect } from 'vitest';
import {
  isHostedPageCheckoutReady,
  isMockHostedPaymentPage,
} from '@/lib/tenantProviderRouting';

describe('hosted page checkout routing (I3-T3, I3-T4)', () => {
  it('treats icount + pageUrl as hosted checkout ready (I3-T3)', () => {
    expect(
      isHostedPageCheckoutReady('icount', 'https://mock.icount.local/pay/ref-1'),
    ).toBe(true);
  });

  it('does not treat icount without pageUrl as ready', () => {
    expect(isHostedPageCheckoutReady('icount', null)).toBe(false);
  });

  it('treats grow + pageUrl as hosted checkout ready', () => {
    expect(isHostedPageCheckoutReady('grow', 'https://mock.grow.local/pay/x')).toBe(true);
  });

  it('detects mock icount page without matching grow mock domain (I3-T4 isolation)', () => {
    const pageUrl = 'https://mock.icount.local/pay/ref-1';
    expect(isMockHostedPaymentPage('icount', pageUrl)).toBe(true);
    expect(isMockHostedPaymentPage('grow', pageUrl)).toBe(false);
  });

  it('detects mock grow page without matching icount mock domain', () => {
    const pageUrl = 'https://mock.grow.local/pay/x';
    expect(isMockHostedPaymentPage('grow', pageUrl)).toBe(true);
    expect(isMockHostedPaymentPage('icount', pageUrl)).toBe(false);
  });

  it('treats invoice4u + pageUrl as hosted checkout ready', () => {
    expect(
      isHostedPageCheckoutReady('invoice4u', 'https://mock.invoice4u.local/pay/ref-1'),
    ).toBe(true);
  });

  it('detects mock invoice4u page without matching grow/icount domains', () => {
    const pageUrl = 'https://mock.invoice4u.local/pay/ref-1';
    expect(isMockHostedPaymentPage('invoice4u', pageUrl)).toBe(true);
    expect(isMockHostedPaymentPage('grow', pageUrl)).toBe(false);
    expect(isMockHostedPaymentPage('icount', pageUrl)).toBe(false);
  });
});

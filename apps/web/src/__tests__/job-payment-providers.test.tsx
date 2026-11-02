// @vitest-environment jsdom
/**
 * Photographer deposit / balance links only charge online where the provider's callback settles
 * the request (YPay, Grow; payments audit P2 #11). Elsewhere no charge is made and the client is
 * asked to pay the studio directly.
 * Run: pnpm -C apps/web test job-payment-providers.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as web from '@/lib/providerPairing';
import * as edge from '../../../../supabase/functions/_shared/provider-pairing';
import {
  createJobPaymentRequestCharge,
  ONLINE_PAYMENT_UNAVAILABLE,
} from '../../../../supabase/functions/_shared/jobs/create-request-charge.ts';
import { makeGrowFakeService } from './helpers/growFakeService';

const { publicRequest } = vi.hoisted(() => ({ publicRequest: vi.fn() }));
vi.mock('@/features/jobs/services/jobPaymentService', async (orig) => {
  const mod = await orig<typeof import('@/features/jobs/services/jobPaymentService')>();
  return { ...mod, JobPaymentService: { ...mod.JobPaymentService, publicRequest } };
});
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import { PublicPayRequest } from '@/features/jobs/components/PublicPayRequest';

afterEach(() => {
  cleanup();
  publicRequest.mockReset();
});

describe('which providers settle job payment requests', () => {
  it('YPay and Grow only (web and edge agree)', () => {
    for (const p of ['ypay', 'grow', 'mock', 'invoice4u', 'icount', 'tranzila', 'offline', null]) {
      expect(web.jobOnlinePaymentSupported(p)).toBe(edge.jobOnlinePaymentSupported(p));
    }
    expect(web.jobOnlinePaymentSupported('ypay')).toBe(true);
    expect(web.jobOnlinePaymentSupported('grow')).toBe(true);
    expect(web.jobOnlinePaymentSupported('invoice4u')).toBe(false);
    expect(web.jobOnlinePaymentSupported('offline')).toBe(false);
  });
});

describe('createJobPaymentRequestCharge', () => {
  const request = {
    id: 'jpr-1', tenant_id: 't1', engagement_id: 'eng-1', status: 'pending', amount_minor: 50000,
    currency: 'ILS', max_installments: 1, label: 'Deposit', public_token: 'tok',
  };

  it.each(['invoice4u', 'icount', 'tranzila', 'offline'])(
    'makes no charge when the studio uses %s',
    async (provider) => {
      const { service, tables } = makeGrowFakeService({
        tables: { tenants: [{ id: 't1', payment_provider: provider }] },
      });
      const result = await createJobPaymentRequestCharge(service, request as never);
      expect(result).toEqual({ ok: false, error: ONLINE_PAYMENT_UNAVAILABLE, status: 409 });
      expect(tables.payments).toHaveLength(0);
    },
  );
});

describe('/pay/:token', () => {
  function renderPage(onlinePaymentAvailable: boolean | undefined) {
    publicRequest.mockResolvedValue({
      request: {
        id: 'jpr-1', label: 'Deposit', amountMinor: 50000, currency: 'ILS', dueDate: null,
        status: 'sent', paidAt: null, maxInstallments: 1, jobDate: null, jobCancelled: false,
        studio: { name: 'Lumen', language: 'en', primaryColor: null, accentColor: null, logoUrl: null },
        paymentProvider: onlinePaymentAvailable === false ? 'invoice4u' : 'ypay',
        ...(onlinePaymentAvailable === undefined ? {} : { onlinePaymentAvailable }),
      },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><PublicPayRequest token="tok" result={null} /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('asks the client to pay the studio directly when online payment is not available', async () => {
    renderPage(false);
    expect(await screen.findByText('pages.pay.payStudioDirectly')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'pages.pay.payNow' })).toBeNull();
  });

  it('offers the Pay button otherwise (also for older responses without the flag)', async () => {
    renderPage(true);
    expect(await screen.findByRole('button', { name: 'pages.pay.payNow' })).toBeTruthy();
    cleanup();
    renderPage(undefined);
    expect(await screen.findByRole('button', { name: 'pages.pay.payNow' })).toBeTruthy();
  });
});

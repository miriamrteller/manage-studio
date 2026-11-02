// @vitest-environment jsdom
/**
 * Payments B (b): "Send card link" on an active monthly enrolment. The parent pays the month
 * that is due on Grow's page with "save this card" on; that month is settled as a renewal, the
 * plan moves past it, and later months are charged to the saved card. YPay and Invoice4U show a
 * "not available yet" note. Fakes only; no provider or database calls.
 * Run: pnpm -C apps/web test card-link.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { finalisePayment, invoke } = vi.hoisted(() => ({
  finalisePayment: vi.fn(async () => undefined),
  invoke: vi.fn(),
}));
vi.mock('../../../../supabase/functions/_shared/payments/finalise-payment.ts', () => ({ finalisePayment }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.provider ? `${key}:${opts.provider}` : key),
    i18n: { language: 'en' },
  }),
}));

import * as web from '@/lib/providerPairing';
import {
  CARD_LINK_PROVIDERS,
  buildCardLinkEmailCopy,
  cardLinkPeriod,
  cardLinkRef,
  createCardLinkCharge,
} from '../../../../supabase/functions/_shared/payments/card-link.ts';
import { fromGrowCustomFields, toGrowCustomFields } from '../../../../supabase/functions/_shared/payments/grow/metadata.ts';
import { settleGrowPayment } from '../../../../supabase/functions/_shared/payments/grow/process-notify.ts';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import { CardLinkButton } from '../features/finance/components/CardLinkButton';
import { formatPeriod } from '../features/finance/components/RecordPaymentModal';
import { makeGrowFakeService } from './helpers/growFakeService';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ENGAGEMENT = '11111111-1111-1111-1111-111111111111';
const BILLING = '22222222-2222-2222-2222-222222222222';
const SCHEDULE = '55555555-5555-5555-5555-555555555555';
const OFFERING = '33333333-3333-3333-3333-333333333333';
const PERSON = '44444444-4444-4444-4444-444444444444';

afterEach(() => {
  cleanup();
  invoke.mockReset();
  finalisePayment.mockClear();
});

function studio(o: { provider?: string; status?: string; tokens?: Record<string, unknown>[] } = {}) {
  return makeGrowFakeService({
    tables: {
      tenants: [{ id: TENANT, currency: 'ILS', payment_provider: o.provider ?? 'grow' }],
      engagements: [{ id: ENGAGEMENT, tenant_id: TENANT, person_id: PERSON, offering_id: OFFERING, billing_account_id: BILLING, status: o.status ?? 'active' }],
      billing_schedules: [{ id: SCHEDULE, tenant_id: TENANT, engagement_id: ENGAGEMENT, billing_account_id: BILLING, next_billing_date: '2026-12-01', status: 'active' }],
      offerings: [{ id: OFFERING, price_minor: 35000, currency: 'ILS' }],
      payment_method_tokens: o.tokens ?? [],
    },
  });
}

const deps = () => ({
  createCharge: vi.fn(async () => ({ providerPaymentRef: 'x', pageUrl: 'https://grow.test/pay', pendingWebhook: true as const })),
  priceMinor: (p: number) => p,
});

describe('createCardLinkCharge', () => {
  it('opens Grow for the month that is due, as a renewal on the plan, with "save this card" on', async () => {
    const d = deps();
    const result = await createCardLinkCharge(studio().service, { tenantId: TENANT, engagementId: ENGAGEMENT }, d);
    expect(result).toMatchObject({ ok: true, pageUrl: 'https://grow.test/pay', period: '2026-12', amountMinor: 35000 });
    expect(d.createCharge).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 35000,
      idempotencyKey: cardLinkRef(SCHEDULE, '2026-12'),
      saveCard: true,
      metadata: expect.objectContaining({ charge_type: 'renewal', billing_schedule_id: SCHEDULE, save_card: '1' }),
    }));
  });

  it('is refused for YPay and Invoice4U, a card already saved, or an enrolment that is not active', async () => {
    for (const provider of ['ypay', 'invoice4u', 'offline']) {
      const d = deps();
      expect(await createCardLinkCharge(studio({ provider }).service, { tenantId: TENANT, engagementId: ENGAGEMENT }, d))
        .toMatchObject({ ok: false, code: 'card_link_unsupported' });
      expect(d.createCharge).not.toHaveBeenCalled();
    }
    const saved = studio({ tokens: [{ id: 't', billing_account_id: BILLING, provider: 'grow', revoked_at: null }] });
    expect(await createCardLinkCharge(saved.service, { tenantId: TENANT, engagementId: ENGAGEMENT }, deps()))
      .toMatchObject({ ok: false, code: 'card_already_saved' });
    expect(await createCardLinkCharge(studio({ status: 'pending_payment' }).service, { tenantId: TENANT, engagementId: ENGAGEMENT }, deps()))
      .toMatchObject({ ok: false, code: 'not_active' });
  });

  it('the web and edge lists of card-link providers agree', () => {
    expect([...web.CARD_LINK_PAYMENT_PROVIDERS]).toEqual([...CARD_LINK_PROVIDERS]);
    expect(web.cardLinkSupported('grow')).toBe(true);
    expect(web.cardLinkSupported('invoice4u')).toBe(false);
    expect(web.cardLinkSupported('ypay')).toBe(false);
  });

  it('has the email wording in English and Hebrew', () => {
    const en = buildCardLinkEmailCopy({ language: 'en', studentName: 'Noa', className: 'Ballet', month: 'December 2026' });
    expect(en.intro).toContain('December 2026');
    expect(en.ctaButton).toBe('Pay and save card');
    const he = buildCardLinkEmailCopy({ language: 'he', studentName: 'Noa', className: 'Ballet', month: 'דצמבר 2026' });
    expect(he.subject).toContain('Ballet');
    expect(he.ctaButton).toBe('תשלום ושמירת הכרטיס');
  });
});

describe('Grow: the card-link payment saves the card and pays its month', () => {
  const metadata = {
    tenant_id: TENANT,
    engagement_id: ENGAGEMENT,
    billing_account_id: BILLING,
    charge_type: 'renewal' as const,
    billing_schedule_id: SCHEDULE,
    total_amount_minor: '35000',
  };

  it('carries "save this card" through Grow’s custom fields', () => {
    expect(fromGrowCustomFields(toGrowCustomFields({ ...metadata, save_card: '1' })).save_card).toBe('1');
    expect(fromGrowCustomFields(toGrowCustomFields(metadata)).save_card).toBeUndefined();
  });

  it('saves the card on a card-link renewal, but not on an ordinary renewal', async () => {
    const { service, tables } = makeGrowFakeService();
    const grow = new GrowPaymentProvider(service);
    await grow.persistCardToken(metadata, { data: { token: 'tok_plain' } });
    expect(tables.payment_method_tokens).toHaveLength(0);
    await grow.persistCardToken({ ...metadata, save_card: '1' }, { data: { token: 'tok_link', cardSuffix: '4242' } });
    expect(tables.payment_method_tokens).toEqual([
      expect.objectContaining({ provider: 'grow', provider_token: 'tok_link', billing_account_id: BILLING, is_default: true }),
    ]);
  });

  it('settling it moves the plan past the month it paid, even when paid early', async () => {
    const { service } = makeGrowFakeService();
    const row = { id: 'pay-1', tenant_id: TENANT, provider: 'grow', engagement_id: ENGAGEMENT, billing_account_id: BILLING, charge_type: 'renewal', status: 'succeeded', total_amount_minor: 35000, currency: 'ILS', job_payment_request_id: null };
    const parsed = {
      event: { type: 'payment.succeeded', providerPaymentRef: cardLinkRef(SCHEDULE, '2026-12'), metadata, amountMinor: 35000, currency: 'ILS' },
      transactionId: '1',
    };
    await settleGrowPayment(service, row, parsed as never);
    expect(finalisePayment).toHaveBeenCalledWith(service, expect.objectContaining({
      chargeType: 'renewal',
      billingScheduleId: SCHEDULE,
      paidForPeriod: '2026-12',
    }));
  });

  it('cardLinkPeriod reads only card-link references', () => {
    expect(cardLinkPeriod(cardLinkRef(SCHEDULE, '2027-01'))).toBe('2027-01');
    expect(cardLinkPeriod('renewal_abc_2027-01')).toBeNull();
    expect(cardLinkPeriod(null)).toBeNull();
  });
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('CardLinkButton', () => {
  it('Grow: sends the link and says so', async () => {
    invoke.mockResolvedValue({ data: { ok: true, emailSent: true, period: '2026-12' }, error: null });
    wrap(<CardLinkButton engagementId={ENGAGEMENT} paymentProvider="grow" />);
    fireEvent.click(screen.getByRole('button', { name: 'finance.card_link.send' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('send-card-link', { body: { engagement_id: ENGAGEMENT } }));
    expect(await screen.findByRole('status')).toHaveTextContent('finance.card_link.sent');
  });

  it('explains when a card is already saved', async () => {
    invoke.mockResolvedValue({ data: { error: 'A card is already saved', code: 'card_already_saved' }, error: null });
    wrap(<CardLinkButton engagementId={ENGAGEMENT} paymentProvider="grow" />);
    fireEvent.click(screen.getByRole('button', { name: 'finance.card_link.send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('finance.card_link.error_card_already_saved');
  });

  it('YPay and Invoice4U: no button, a "not available yet" note instead', () => {
    for (const provider of ['ypay', 'invoice4u']) {
      wrap(<CardLinkButton engagementId={ENGAGEMENT} paymentProvider={provider} />);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByRole('note')).toHaveTextContent('finance.card_link.unsupported');
      cleanup();
    }
  });

  it('pay at the studio: nothing', () => {
    const { container } = wrap(<CardLinkButton engagementId={ENGAGEMENT} paymentProvider="offline" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('formatPeriod', () => {
  it('shows a month name', () => {
    expect(formatPeriod('2026-12', 'en-GB')).toBe('December 2026');
    expect(formatPeriod('bad', 'en')).toBe('bad');
  });
});

describe('RecordPaymentModal, monthly', () => {
  it('records a monthly fee for an active enrolment through record-payment', async () => {
    const { RecordPaymentModal } = await import('../features/finance/components/RecordPaymentModal');
    invoke.mockResolvedValue({ data: { ok: true, paymentId: 'p1', period: '2026-12' }, error: null });
    const onRecorded = vi.fn();
    wrap(<RecordPaymentModal kind="monthly" engagementId={ENGAGEMENT} onRecorded={onRecorded} />);
    expect(screen.getByText('finance.record_payment.monthly_title')).toBeTruthy();
    expect(screen.getByText('finance.record_payment.monthly_hint')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.submit' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('record-payment', { body: { engagement_id: ENGAGEMENT, method: 'cash', note: undefined } }),
    );
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });
});

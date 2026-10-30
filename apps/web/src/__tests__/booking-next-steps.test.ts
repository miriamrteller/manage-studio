// @vitest-environment node
/**
 * Quote → sign → pay, with no waiting for the photographer:
 *  - accept-quote's next-step links (resolveQuoteNextSteps),
 *  - the post-signing next step (resolveJobNextStep) and its token checks,
 *  - the shared signing-link helper (contract-sign-link.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CLIENT_PORTAL_PATH,
  depositRequestIdFromAcceptResult,
  resolveJobNextStep,
  resolveQuoteNextSteps,
  type JobNextStepDeps,
  type NextStepRequest,
  type QuoteNextStepsDeps,
} from '../../../../supabase/functions/_shared/jobs/booking-next-steps.ts';
import {
  contractLinkBlocker,
  jobContractSignPath,
  mintJobContractSignLink,
} from '../../../../supabase/functions/_shared/jobs/contract-sign-link.ts';
import { clientContractSignPath } from '../../../../supabase/functions/_shared/jobs/client-contract-link.ts';
import { verifyWaiverToken } from '../../../../supabase/functions/_shared/waiver-token.ts';

const ENG = '11111111-1111-4111-8111-111111111111';
const OTHER_ENG = '22222222-2222-4222-8222-222222222222';
const DEPOSIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BALANCE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEPOSIT_TOKEN = 'd'.repeat(48);
const BALANCE_TOKEN = 'b'.repeat(48);

const acceptResult = (over: Record<string, unknown> = {}) => ({
  ok: true,
  engagement_id: ENG,
  deposit_minor: 30000,
  payment_request_ids: [DEPOSIT_ID, BALANCE_ID],
  ...over,
});

const request = (over: Partial<NextStepRequest>): NextStepRequest => ({
  id: DEPOSIT_ID,
  engagement_id: ENG,
  status: 'pending',
  public_token: DEPOSIT_TOKEN,
  amount_minor: 30000,
  currency: 'ILS',
  ...over,
});

const openRequests = () => [
  request({}),
  request({ id: BALANCE_ID, public_token: BALANCE_TOKEN, amount_minor: 70000 }),
];

function quoteDeps(over: Partial<QuoteNextStepsDeps> = {}): QuoteNextStepsDeps {
  return {
    loadJob: vi.fn(async () => ({
      waiverEvidenceId: null,
      engagementStatus: 'active',
      jobStatus: 'booked',
      clientEmail: 'Pat@Example.test',
    })),
    hasActiveTemplate: vi.fn(async () => true),
    loadRequests: vi.fn(async () => openRequests()),
    mintSignPath: vi.fn(async (engagementId: string) => jobContractSignPath(engagementId, 'tok.sig')),
    ...over,
  };
}

describe('depositRequestIdFromAcceptResult', () => {
  it('is the first request id when the quote has a deposit', () => {
    expect(depositRequestIdFromAcceptResult(acceptResult())).toBe(DEPOSIT_ID);
  });

  it('is null without a deposit (the first request is then the balance)', () => {
    expect(depositRequestIdFromAcceptResult(acceptResult({ deposit_minor: 0, payment_request_ids: [BALANCE_ID] }))).toBeNull();
    expect(depositRequestIdFromAcceptResult(null)).toBeNull();
    expect(depositRequestIdFromAcceptResult(acceptResult({ payment_request_ids: 'nope' }))).toBeNull();
  });
});

describe('resolveQuoteNextSteps (accept-quote)', () => {
  it('returns the signing link and the deposit pay link', async () => {
    const deps = quoteDeps();
    const steps = await resolveQuoteNextSteps(deps, acceptResult());
    expect(steps).toEqual({
      contractSignPath: `/enrol/complete?engagementId=${ENG}&wt=tok.sig`,
      depositPayPath: `/pay/${DEPOSIT_TOKEN}`,
    });
    // The link is for the job's own (normalised) client email.
    expect(deps.mintSignPath).toHaveBeenCalledWith(ENG, 'pat@example.test');
  });

  it('is idempotent on a replayed accept: same links, nothing but reads and a fresh token', async () => {
    const deps = quoteDeps();
    const first = await resolveQuoteNextSteps(deps, acceptResult());
    const second = await resolveQuoteNextSteps(deps, { ...acceptResult(), already_accepted: true } as never);
    expect(second).toEqual(first);
    expect(deps.mintSignPath).toHaveBeenCalledTimes(2);
  });

  it('without a contract template returns only the deposit link', async () => {
    const steps = await resolveQuoteNextSteps(quoteDeps({ hasActiveTemplate: async () => false }), acceptResult());
    expect(steps).toEqual({ depositPayPath: `/pay/${DEPOSIT_TOKEN}` });
  });

  it('drops the signing link once the contract is signed, and the pay link once the deposit is paid', async () => {
    const steps = await resolveQuoteNextSteps(
      quoteDeps({
        loadJob: async () => ({ waiverEvidenceId: 'ev-1', engagementStatus: 'active', jobStatus: 'booked', clientEmail: 'p@x.test' }),
        loadRequests: async () => [request({ status: 'paid' })],
      }),
      acceptResult(),
    );
    expect(steps).toEqual({});
  });

  it('gives no links for a cancelled shoot or a client without an email', async () => {
    const cancelled = await resolveQuoteNextSteps(
      quoteDeps({ loadJob: async () => ({ waiverEvidenceId: null, engagementStatus: 'active', jobStatus: 'cancelled', clientEmail: 'p@x.test' }) }),
      acceptResult({ deposit_minor: 0, payment_request_ids: [] }),
    );
    expect(cancelled).toEqual({});
    const noEmail = await resolveQuoteNextSteps(
      quoteDeps({ loadJob: async () => ({ waiverEvidenceId: null, engagementStatus: 'active', jobStatus: 'booked', clientEmail: null }) }),
      acceptResult(),
    );
    expect(noEmail).toEqual({ depositPayPath: `/pay/${DEPOSIT_TOKEN}` });
  });

  it('never links a deposit that belongs to another job', async () => {
    const steps = await resolveQuoteNextSteps(
      quoteDeps({ hasActiveTemplate: async () => false, loadRequests: async () => [request({ engagement_id: OTHER_ENG })] }),
      acceptResult(),
    );
    expect(steps).toEqual({});
  });

  it('a zero-deposit quote has no pay link (the balance is not the deposit)', async () => {
    const steps = await resolveQuoteNextSteps(
      quoteDeps({ hasActiveTemplate: async () => false, loadRequests: async () => [request({ id: BALANCE_ID })] }),
      acceptResult({ deposit_minor: 0, payment_request_ids: [BALANCE_ID] }),
    );
    expect(steps).toEqual({});
  });
});

function nextDeps(over: Partial<JobNextStepDeps> = {}): JobNextStepDeps {
  return {
    loadJob: vi.fn(async () => ({ personId: 'person-1', waiverEvidenceId: 'ev-1' })),
    allowedEmails: vi.fn(async () => new Set(['pat@example.test'])),
    loadAcceptedQuoteResult: vi.fn(async () => acceptResult()),
    loadRequests: vi.fn(async () => openRequests()),
    ...over,
  };
}

const token = { eid: ENG, em: 'Pat@example.test' };

describe('resolveJobNextStep (after signing)', () => {
  it('deposit unpaid → pay the deposit', async () => {
    expect(await resolveJobNextStep(nextDeps(), { token, requestedEngagementId: ENG })).toEqual({
      ok: true,
      next: 'pay_deposit',
      payPath: `/pay/${DEPOSIT_TOKEN}`,
      amountMinor: 30000,
      currency: 'ILS',
    });
  });

  it('deposit already paid → client portal (not the balance)', async () => {
    const deps = nextDeps({
      loadRequests: async () => [request({ status: 'paid' }), request({ id: BALANCE_ID, public_token: BALANCE_TOKEN })],
    });
    expect(await resolveJobNextStep(deps, { token, requestedEngagementId: ENG })).toEqual({
      ok: true, next: 'portal', portalPath: CLIENT_PORTAL_PATH, reason: 'deposit_paid',
    });
  });

  it('no deposit (no accepted quote, or a 0% deposit) → client portal', async () => {
    const noQuote = nextDeps({ loadAcceptedQuoteResult: async () => null });
    expect(await resolveJobNextStep(noQuote, { token, requestedEngagementId: ENG })).toMatchObject({
      next: 'portal', reason: 'no_deposit',
    });
    const zero = nextDeps({ loadAcceptedQuoteResult: async () => acceptResult({ deposit_minor: 0, payment_request_ids: [BALANCE_ID] }) });
    expect(await resolveJobNextStep(zero, { token, requestedEngagementId: ENG })).toMatchObject({
      next: 'portal', reason: 'no_deposit',
    });
  });

  it('rejects a token from another job before reading anything', async () => {
    const deps = nextDeps();
    expect(await resolveJobNextStep(deps, { token: { eid: OTHER_ENG, em: token.em }, requestedEngagementId: ENG })).toEqual({
      ok: false, status: 403, code: 'token_mismatch',
    });
    expect(deps.loadJob).not.toHaveBeenCalled();
    expect(deps.loadRequests).not.toHaveBeenCalled();
  });

  it('never returns another job\'s pay link, even if the quote snapshot points at it', async () => {
    const deps = nextDeps({ loadRequests: async () => [request({ engagement_id: OTHER_ENG })] });
    expect(await resolveJobNextStep(deps, { token, requestedEngagementId: ENG })).toMatchObject({ next: 'portal' });
  });

  it('rejects a token for an email that is not the job\'s client', async () => {
    const deps = nextDeps({ allowedEmails: async () => new Set(['someone@else.test']) });
    expect(await resolveJobNextStep(deps, { token, requestedEngagementId: ENG })).toEqual({
      ok: false, status: 403, code: 'email_mismatch',
    });
  });

  it('is not available for a dance waiver engagement (not a job)', async () => {
    const deps = nextDeps({ loadJob: async () => null });
    expect(await resolveJobNextStep(deps, { token, requestedEngagementId: ENG })).toEqual({
      ok: false, status: 404, code: 'not_job',
    });
  });

  it('waits for the signature', async () => {
    const deps = nextDeps({ loadJob: async () => ({ personId: 'person-1', waiverEvidenceId: null }) });
    expect(await resolveJobNextStep(deps, { token, requestedEngagementId: ENG })).toEqual({
      ok: false, status: 409, code: 'not_signed',
    });
  });
});

describe('contract-sign-link (shared by accept-quote, send-job-contract-link, client-job-contract-link)', () => {
  it('blocks links in the same order the admin send always did', () => {
    const job = { waiverEvidenceId: null, engagementStatus: 'active', jobStatus: 'booked' };
    expect(contractLinkBlocker(null, true)?.code).toBe('not_found');
    expect(contractLinkBlocker({ ...job, jobStatus: 'cancelled', waiverEvidenceId: 'ev' }, true)?.code).toBe('cancelled');
    expect(contractLinkBlocker({ ...job, waiverEvidenceId: 'ev' }, true)?.code).toBe('already_signed');
    expect(contractLinkBlocker(job, false)?.code).toBe('no_template');
    expect(contractLinkBlocker(job, true)).toBeNull();
  });

  it('client portal keeps the same path shape', () => {
    expect(clientContractSignPath('e 1', 'a.b+c')).toBe(jobContractSignPath('e 1', 'a.b+c'));
  });

  it('mints a token bound to the job, tenant and email that verifies', async () => {
    const service = {
      rpc: vi.fn(async () => ({ data: 'tenant-secret', error: null })),
    } as unknown as SupabaseClient;
    const link = await mintJobContractSignLink(service, {
      tenantId: 'tenant-1', engagementId: ENG, email: ' Pat@Example.test ', ttlSeconds: 3600,
    });
    expect(link.path).toBe(jobContractSignPath(ENG, link.token));
    const payload = await verifyWaiverToken(service, link.token);
    expect(payload).toMatchObject({ eid: ENG, tid: 'tenant-1', em: 'pat@example.test' });
    expect(payload!.exp).toBe(link.expiresAt);

    // Tampering with the engagement breaks the signature.
    const [body, sig] = link.token.split('.');
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const forged = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    forged.eid = OTHER_ENG;
    const forgedBody = btoa(JSON.stringify(forged)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(await verifyWaiverToken(service, `${forgedBody}.${sig}`)).toBeNull();
  });
});

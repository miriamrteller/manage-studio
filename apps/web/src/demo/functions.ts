/**
 * In-browser versions of the Edge Functions the photographer screens invoke.
 * Nothing leaves the browser: emails land in the demo outbox.
 */
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row } from './fakeSupabase';
import { sendToOutbox } from './outbox';
import { TENANT_ID } from './seed';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

export function formatIls(minor: number): string {
  return new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(minor / 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'To be confirmed';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Demo waiver token: just the engagement id, prefixed. */
export function contractToken(engagementId: string): string {
  return `demo-${engagementId}`;
}

export function contractSignHref(engagementId: string): string {
  return `#/enrol/complete?engagementId=${encodeURIComponent(engagementId)}&wt=${encodeURIComponent(contractToken(engagementId))}`;
}

function renderContract(ctx: DemoContext, engagementId: string): { template: Row; personId: string; offeringId: string; signed: boolean } {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  if (!eng) throw new DemoRpcError('Shoot not found');
  const tpl = rows(ctx, 'consent_templates').find((t) => t.status === 'active');
  if (!tpl) throw new DemoRpcError('No active contract template');
  const person = rows(ctx, 'people').find((p) => p.id === eng.person_id);
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng.offering_id);
  const job = rows(ctx, 'job_details').find((j) => j.engagement_id === engagementId);
  const content = String(tpl.content)
    .replace(/\{\{client_name\}\}/g, String(person?.name ?? ''))
    .replace(/\{\{package\}\}/g, String(offering?.name ?? ''))
    .replace(/\{\{shoot_date\}\}/g, formatDate(eng.booked_starts_at as string | null))
    .replace(/\{\{location\}\}/g, String(job?.location ?? 'To be confirmed'))
    .replace(/\{\{price\}\}/g, formatIls(Number(offering?.price_minor ?? 0)));
  return {
    template: { id: tpl.id, version: tpl.version, name: tpl.name, content },
    personId: eng.person_id as string,
    offeringId: eng.offering_id as string,
    signed: Boolean(eng.waiver_evidence_id),
  };
}

export function engagementFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const raw = token.replace(/^WaiverToken\s+/, '');
  return raw.startsWith('demo-') ? raw.slice(5) : null;
}

/** The deposit accept_quote created for this shoot (first request id, when deposit > 0). */
export function demoDepositRequest(ctx: DemoContext, engagementId: string): Row | null {
  const quote = rows(ctx, 'quotes').find((q) => q.engagement_id === engagementId && q.status === 'accepted');
  const result = (quote?.accepted_result ?? null) as Row | null;
  const ids = (result?.payment_request_ids ?? []) as string[];
  if (!result || !(Number(result.deposit_minor) > 0) || !ids[0]) return null;
  return rows(ctx, 'job_payment_requests').find((r) => r.id === ids[0] && r.engagement_id === engagementId) ?? null;
}

/** Signing path for the client, when there is a contract to sign. */
export function demoContractSignPath(ctx: DemoContext, engagementId: string): string | null {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  const hasTemplate = rows(ctx, 'consent_templates').some((t) => t.status === 'active');
  if (!eng || eng.waiver_evidence_id || !hasTemplate) return null;
  return contractSignHref(engagementId).slice(1);
}

export const baseFunctions: Record<string, FunctionHandler> = {
  'send-job-contract-link': (body, ctx) => {
    const engagementId = String(body.engagementId ?? '');
    const email = String(body.recipientEmail ?? '');
    const c = renderContract(ctx, engagementId);
    if (c.signed) throw new DemoRpcError('Contract already signed');
    const person = rows(ctx, 'people').find((p) => p.id === c.personId);
    sendToOutbox({
      to: email,
      subject: 'Please sign your photography agreement',
      body: `Hi ${person?.name ?? ''}, your agreement with Lumen & Light Photography is ready to sign.`,
      link: { label: 'Open the signing page', href: contractSignHref(engagementId) },
    });
    return { emailSent: true };
  },

  'get-waiver-engagement': (body, ctx) => {
    const engagementId = engagementFromToken(body.__authorization as string | undefined);
    if (!engagementId) throw new DemoRpcError('Invalid or expired link');
    const c = renderContract(ctx, engagementId);
    if (c.signed) return { alreadySigned: true, isJob: true };
    return { isJob: true, personId: c.personId, offeringId: c.offeringId, template: c.template };
  },

  // After signing: the unpaid deposit, else the client portal (mirrors job-next-step).
  'job-next-step': (body, ctx) => {
    const engagementId = engagementFromToken(body.__authorization as string | undefined);
    if (!engagementId || body.engagementId !== engagementId) throw new DemoRpcError('token_mismatch');
    const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
    if (!eng) throw new DemoRpcError('not_job');
    if (!eng.waiver_evidence_id) throw new DemoRpcError('not_signed');
    const deposit = demoDepositRequest(ctx, engagementId);
    if (deposit && (deposit.status === 'pending' || deposit.status === 'sent')) {
      return { next: 'pay_deposit', payPath: `/pay/${String(deposit.public_token)}`, amountMinor: deposit.amount_minor, currency: deposit.currency };
    }
    return { next: 'portal', portalPath: '/dashboard/portal', reason: deposit ? 'deposit_paid' : 'no_deposit' };
  },

  'waiver-viewed': () => ({
    view_token: `demo-view-${Date.now()}`,
    viewed_at_ts: Math.floor(Date.now() / 1000),
  }),

  'accept-waiver': (body, ctx) => {
    const engagementId =
      (body.engagement_id as string | undefined) ?? engagementFromToken(body.__authorization as string | undefined);
    const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
    if (!eng) throw new DemoRpcError('Shoot not found');
    if (eng.waiver_evidence_id) return { evidence_id: eng.waiver_evidence_id };
    const evidenceId = ctx.uuid();
    rows(ctx, 'waiver_evidence').push({
      id: evidenceId,
      tenant_id: TENANT_ID,
      engagement_id: eng.id,
      person_id: eng.person_id,
      consent_template_id: body.consent_template_id,
      signer_name: body.typed_name,
      signed_at: ctx.now(),
      created_at: ctx.now(),
    });
    eng.waiver_evidence_id = evidenceId;
    return { evidence_id: evidenceId };
  },
};

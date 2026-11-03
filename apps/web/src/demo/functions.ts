/**
 * In-browser versions of the Edge Functions the photographer screens invoke.
 * Nothing leaves the browser: emails land in the demo outbox.
 */
import { maskIdNumber, sealSignerDetails, validateSignerDetails } from '@shared/signerDetails';
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row } from './fakeSupabase';
import { sendToOutbox } from './outbox';
import { canRead } from './rls';
import { ADMIN_EMAIL, DEMO_CONTRACT_HOST, TENANT_ID } from './seed';

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

/** What the signed-contract PDF would show: the sealed wording, signer and time. */
export function signedContractView(
  ctx: DemoContext,
  engagementId: string,
): { title: string; content: string; signerName: string; signedAt: string } | null {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  const evidence = rows(ctx, 'waiver_evidence').find((w) => w.id === eng?.waiver_evidence_id);
  if (!eng || !evidence) return null;
  const { template } = renderContract(ctx, engagementId);
  return {
    title: String(template.name),
    content: String(template.content),
    signerName: String(evidence.signer_name ?? ''),
    signedAt: String(evidence.signed_at ?? ''),
  };
}

function contractPdfLink(engagementId: string) {
  return {
    url: `${DEMO_CONTRACT_HOST}/${engagementId}`,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

function isAdmin(ctx: DemoContext): boolean {
  const p = rows(ctx, 'user_profiles').find((u) => u.id === ctx.user?.id);
  return Array.isArray(p?.role) && (p?.role as string[]).includes('tenant_admin');
}

function emailEnabled(ctx: DemoContext, key: string): boolean {
  const row = rows(ctx, 'tenant_automatic_emails').find((r) => r.email_key === key);
  return row ? Boolean(row.enabled) : true;
}

export function engagementFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const raw = token.replace(/^WaiverToken\s+/, '');
  return raw.startsWith('demo-') ? raw.slice(5) : null;
}

/**
 * get-waiver-engagement signerPrefill (_shared/guest-signer-prefill.ts): the
 * name, email and phone of the person the link was sent to, the account holder
 * first. Never the ID number or address. A demo link carries no email, so the
 * first of them with an email on file is the one it was sent to.
 */
export function demoSignerPrefill(ctx: DemoContext, personId: string): { full_name: string | null; email: string; phone: string | null } | null {
  const people = rows(ctx, 'people');
  const person = people.find((p) => p.id === personId);
  if (!person) return null;
  const holderId = person.account_id
    ? rows(ctx, 'account_members').find((m) => m.account_id === person.account_id && m.role === 'account_holder')?.person_id
    : undefined;
  const ids = [holderId, personId].filter((id, i, all): id is string => Boolean(id) && all.indexOf(id) === i);
  const signer = ids.map((id) => people.find((p) => p.id === id)).find((p) => String(p?.email ?? '').trim());
  if (!signer) return null;
  const prefs = rows(ctx, 'contact_preferences').find((c) => c.person_id === signer.id);
  const phone = String(prefs?.whatsapp_number ?? prefs?.voice_number ?? '').trim();
  return {
    full_name: String(signer.name ?? '').trim() || null,
    email: String(signer.email).trim().toLowerCase(),
    phone: phone || null,
  };
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
    const signerPrefill = demoSignerPrefill(ctx, c.personId);
    return {
      isJob: true,
      personId: c.personId,
      offeringId: c.offeringId,
      template: c.template,
      ...(signerPrefill ? { signerPrefill } : {}),
    };
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

  // The real function mints a short-lived signed URL for the PDF in private
  // storage. The demo returns a placeholder link that the demo bar opens as an
  // in-page view of the signed contract.
  'job-contract-pdf-link': (body, ctx) => {
    const engagementId = String(body.engagementId ?? '');
    const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
    if (!eng || !ctx.user || !canRead('engagements', eng, ctx)) throw new DemoRpcError('Shoot not found');
    if (!eng.waiver_evidence_id) throw new DemoRpcError('Contract not signed yet');
    return contractPdfLink(engagementId);
  },

  'job-contract-pdf-generate': (body, ctx) => {
    if (!isAdmin(ctx)) throw new DemoRpcError('Forbidden');
    const engagementId = String(body.engagementId ?? '');
    const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
    if (!eng) throw new DemoRpcError('Shoot not found');
    if (!eng.waiver_evidence_id) throw new DemoRpcError('Contract not signed yet');
    const job = rows(ctx, 'job_details').find((j) => j.engagement_id === engagementId);
    if (job) job.contract_pdf_pending = false;
    return contractPdfLink(engagementId);
  },

  'accept-waiver': (body, ctx) => {
    const engagementId =
      (body.engagement_id as string | undefined) ?? engagementFromToken(body.__authorization as string | undefined);
    // Class enrolments (no job_details row) follow the dance rules below.
    if (!rows(ctx, 'job_details').some((j) => j.engagement_id === engagementId)) {
      return acceptClassWaiver(body, engagementId ?? null, ctx);
    }
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
    // Signed-contract copies (contract_signed_client / contract_signed_studio).
    const person = rows(ctx, 'people').find((p) => p.id === eng.person_id);
    const link = { label: 'Open the signed contract (PDF)', href: contractPdfLink(String(eng.id)).url };
    if (person?.email && emailEnabled(ctx, 'contract_signed_client')) {
      sendToOutbox({
        to: String(person.email),
        subject: 'Your signed photography agreement',
        body: `Hi ${String(person.name ?? '')}, thank you for signing. A copy of your agreement is attached.`,
        link,
      });
    }
    if (emailEnabled(ctx, 'contract_signed_studio')) {
      sendToOutbox({
        to: ADMIN_EMAIL,
        subject: `Contract signed: ${String(person?.name ?? '')}`,
        body: `${String(body.typed_name ?? person?.name ?? '')} signed the photography agreement.`,
        link,
      });
    }
    return { evidence_id: evidenceId };
  },
};

/**
 * accept-waiver for a class enrolment (supabase/functions/accept-waiver):
 * records the evidence, then links it to a pending_payment enrolment, or (no
 * engagement given) activates the person's pending_waiver enrolments.
 */
function acceptClassWaiver(body: Row, engagementId: string | null, ctx: DemoContext): Row {
  if (!ctx.user && !engagementId) throw new DemoRpcError('Missing authorization');
  const personId = String(body.person_id ?? '');
  if (!personId || !body.consent_template_id || !body.typed_name) throw new DemoRpcError('Missing required fields');
  const template = rows(ctx, 'consent_templates').find((t) => t.id === body.consent_template_id && t.status === 'active');
  if (!template) throw new DemoRpcError('No active consent template');
  const replay = rows(ctx, 'waiver_evidence').find((w) => w.idempotency_key && w.idempotency_key === body.idempotency_key);
  const signedAt = ctx.now();
  const evidenceId = (replay?.id as string | undefined) ?? ctx.uuid();
  // Signer details are validated with the same shared rules as the real function; the demo keeps
  // them in the evidence row so the admin "Signed details" dialog has something to show.
  const checked = validateSignerDetails(body.signer_details, { requireChild: false });
  if (!checked.ok) throw new DemoRpcError('signer_details_invalid');
  const sealed = sealSignerDetails(checked.value, null);
  if (!replay) {
    const member = rows(ctx, 'account_members').find((m) => m.id === body.account_member_id);
    rows(ctx, 'waiver_evidence').push({
      id: evidenceId, tenant_id: TENANT_ID, person_id: personId, account_member_id: member?.id ?? null,
      offering_id: body.offering_id ?? null, consent_template_id: template.id, consent_version: template.version,
      consent_version_hash: template.version_hash, wording_snapshot: template.content,
      pdf_storage_path: '', pdf_sha256: '', record_hmac: '', viewed_at: signedAt,
      signed_by_name: String(body.typed_name).trim(), signed_by_email: ctx.user?.email ?? null,
      signed_by_role: member ? 'guardian' : 'self', signature_method: 'typed_name_checkbox',
      guardian_confirmed: body.guardian_confirmed === true, status: 'signed', signed_at: signedAt,
      idempotency_key: body.idempotency_key ?? null, created_at: signedAt,
      signer_details: sealed, signer_id_masked: maskIdNumber(sealed.signer.id_number),
    });
  }
  const engagements = rows(ctx, 'engagements');
  if (engagementId) {
    const eng = engagements.find((e) => e.id === engagementId);
    if (eng && eng.person_id === personId && eng.status === 'pending_payment' && (!body.offering_id || eng.offering_id === body.offering_id)) {
      eng.waiver_evidence_id = evidenceId;
      eng.updated_at = signedAt;
    }
  } else {
    for (const e of engagements) {
      if (e.person_id === personId && e.status === 'pending_waiver') {
        e.status = 'active';
        e.waiver_evidence_id = evidenceId;
        e.updated_at = signedAt;
      }
    }
  }
  return { evidence_id: evidenceId, signed_at: signedAt };
}

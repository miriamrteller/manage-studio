/**
 * Demo handlers for the dance-studio flows (class enrolment, pay at the studio,
 * offline payments). Each mirrors the Edge Function or SQL function it stands
 * in for; the photographer demo never calls them.
 */
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row, type RpcHandler } from './fakeSupabase';
import queryClient from '@/lib/query-client';
import { sendToOutbox } from './outbox';
import { canRead } from './rls';
import { TENANT_ID } from './seed';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

function profile(ctx: DemoContext): Row | undefined {
  return rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id);
}

function isAdmin(ctx: DemoContext): boolean {
  const roles = (profile(ctx)?.role as string[] | undefined) ?? [];
  return roles.includes('tenant_admin');
}

function requireAdmin(ctx: DemoContext): void {
  if (!ctx.user) throw new DemoRpcError('Authentication required');
  if (!isAdmin(ctx)) throw new DemoRpcError('Forbidden');
}

/** Age in whole years on `ref` (YYYY-MM-DD). */
function ageAt(dob: string, ref: string): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ry, rm, rd] = ref.split('-').map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

/** _shared/age-eligibility.ts isAgeEligible */
function isAgeEligible(offering: Row, person: Row | undefined, seasonStart: string | null): boolean | null {
  const dob = person?.date_of_birth as string | null | undefined;
  if (!dob) return null;
  if (offering.min_age == null && offering.max_age == null) return true;
  if (!seasonStart) return true;
  const age = ageAt(dob, seasonStart);
  if (offering.min_age != null && age < Number(offering.min_age)) return false;
  if (offering.max_age != null && age > Number(offering.max_age)) return false;
  return true;
}

/** Can the signed-in user act for this person (admin, themselves, or their family account)? */
function canActFor(ctx: DemoContext, personId: string): boolean {
  if (!ctx.user) return false;
  if (isAdmin(ctx)) return true;
  const person = rows(ctx, 'people').find((p) => p.id === personId);
  return !!person && canRead('people', person, ctx);
}

/** _shared/ensure-billing-account.ts: the account holder's (or the person's own) active billing account. */
function ensureBillingAccount(ctx: DemoContext, studentId: string): string {
  const student = rows(ctx, 'people').find((p) => p.id === studentId);
  const holder = student?.account_id
    ? rows(ctx, 'account_members').find((m) => m.account_id === student.account_id && m.role === 'account_holder')
    : undefined;
  const payerId = String(holder?.person_id ?? studentId);
  const payer = rows(ctx, 'people').find((p) => p.id === payerId);
  const billing = rows(ctx, 'billing_accounts');
  const existing: Row | undefined =
    (payer?.account_id ? billing.find((b) => b.account_id === payer.account_id && b.status === 'active') : undefined) ??
    billing.find((b) => b.person_id === payerId && b.status === 'active');
  if (existing) return String(existing.id);
  const created = {
    id: ctx.uuid(), tenant_id: TENANT_ID, account_id: payer?.account_id ?? null, person_id: payer?.account_id ? null : payerId,
    business_tax_id: null, business_name: null, status: 'active', created_at: ctx.now(), updated_at: ctx.now(),
  };
  billing.push(created);
  return created.id;
}

/** App links in the demo live under the hash router on the current page. */
function appBase(): string {
  return `${window.location.href.split('#')[0]}#`;
}

const BLOCKING_DUPLICATE = new Set(['active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer']);

/** _shared/resolve-or-create-engagement.ts */
function resolveOrCreateEngagement(ctx: DemoContext, body: Row): string {
  const personId = String(body.person_id ?? '');
  const offeringId = String(body.offering_id ?? '');
  const seasonId = String(body.season_id ?? '');
  if (!canActFor(ctx, personId)) throw new DemoRpcError('Not allowed to enrol this person');
  const engagements = rows(ctx, 'engagements');
  const same = (e: Row) => e.person_id === personId && e.offering_id === offeringId && e.season_id === seasonId;
  const pending = engagements.find((e) => same(e) && e.status === 'pending_payment');
  if (pending) {
    pending.billing_account_id ??= ensureBillingAccount(ctx, personId);
    return String(pending.id);
  }
  if (engagements.some((e) => same(e) && BLOCKING_DUPLICATE.has(String(e.status)))) {
    throw new DemoRpcError('Person already enrolled in this class for this term');
  }
  const offering = rows(ctx, 'offerings').find((o) => o.id === offeringId);
  if (!offering) throw new DemoRpcError('Offering not found');
  const person = rows(ctx, 'people').find((p) => p.id === personId);
  const season = rows(ctx, 'seasons').find((s) => s.id === offering.season_id);
  const insert: Row = {
    id: ctx.uuid(), tenant_id: TENANT_ID, person_id: personId, offering_id: offeringId, season_id: seasonId,
    status: 'pending_payment', waiver_evidence_id: body.waiver_evidence_id ?? null,
    billing_account_id: ensureBillingAccount(ctx, personId),
    billing_status: null, payment_received_at: null, payment_dunning_attempt_count: 0,
    booked_starts_at: null, booked_ends_at: null, created_at: ctx.now(), updated_at: ctx.now(),
  };
  if (isAgeEligible(offering, person, (season?.start_date as string | undefined) ?? null) === false) {
    if (!body.age_override_confirmed) throw new DemoRpcError('Student is not eligible for this class age range');
    if (!isAdmin(ctx)) throw new DemoRpcError('Only the studio can override the age range');
    insert.age_override_at = ctx.now();
    insert.age_override_by = ctx.user?.id ?? null;
    insert.age_override_reason = (body.age_override_reason as string | null) ?? null;
  }
  engagements.push(insert);
  return String(insert.id);
}

/** _shared/enrolment-completion-context.ts */
function completionContext(ctx: DemoContext, engagementId: string): Row {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  if (!eng) throw new DemoRpcError('Engagement not found');
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng.offering_id);
  const student = rows(ctx, 'people').find((p) => p.id === eng.person_id);
  if (!offering || !student) throw new DemoRpcError('Engagement not found');
  const tenant = rows(ctx, 'tenants')[0];
  const active = offering.waiver_required
    ? rows(ctx, 'consent_templates').find((t) => t.tenant_id === TENANT_ID && t.status === 'active')
    : undefined;
  const template = active ? { id: active.id, version: active.version, name: active.name, content: active.content } : null;
  const evidence = rows(ctx, 'waiver_evidence');
  const linked = eng.waiver_evidence_id
    ? evidence.find((w) => w.id === eng.waiver_evidence_id && w.person_id === eng.person_id)
    : undefined;
  const recent = !linked && offering.waiver_required
    ? evidence
        .filter((w) => w.person_id === eng.person_id && w.offering_id === eng.offering_id && w.status === 'signed')
        .sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)))[0]
    : undefined;
  const evidenceId = (linked?.id ?? recent?.id ?? null) as string | null;
  const dob = student.date_of_birth as string | null;
  return {
    engagementId: eng.id,
    personId: eng.person_id,
    offeringId: eng.offering_id,
    tenantId: TENANT_ID,
    status: eng.status,
    alreadyComplete: eng.status === 'active',
    studentName: student.name,
    className: offering.name,
    waiverRequired: Boolean(offering.waiver_required && template),
    waiverAlreadySigned: !template || !!evidenceId,
    waiverEvidenceId: evidenceId,
    template,
    isMinorStudent: dob ? new Date(dob) > new Date(Date.now() - 18 * 365.25 * 86_400_000) : false,
    amountMinor: Number(offering.price_minor ?? 0),
    currency: String(offering.currency ?? tenant?.currency ?? 'ILS').toUpperCase(),
    billingMode: offering.billing_mode ?? null,
    billingInterval: offering.billing_interval ?? null,
    appointment: null,
  };
}

/** _shared/create-checkout-charge.ts for a studio that takes payment in person. */
function offlineCharge(ctx: DemoContext, engagementId: string): Row {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng?.offering_id);
  const tenant = rows(ctx, 'tenants')[0];
  if (tenant?.payment_provider !== 'offline') {
    throw new DemoRpcError('The demo studio only takes payment at the studio');
  }
  return {
    clientSecret: null,
    paymentIntentId: null,
    publishableKey: null,
    amountMinor: Number(offering?.price_minor ?? 0),
    currency: String(offering?.currency ?? 'ILS'),
    paymentProvider: 'offline',
    offlineInstructions: (tenant?.offline_payment_instructions as string | null | undefined) ?? null,
    mockCompleted: false,
    mockPending: false,
    pageUrl: null,
    pendingWebhook: false,
    alreadyPaid: eng?.status === 'active',
    billingMode: offering?.billing_mode ?? null,
    billingInterval: offering?.billing_interval ?? null,
  };
}

/** checkout-bootstrap-parse.ts resolveBootstrapBlockReason (an unsigned form never blocks payment). */
function blockReason(status: string): string | undefined {
  if (status === 'active') return 'already_complete';
  if (status === 'pending_waiver') return 'pending_waiver';
  if (status !== 'pending_payment') return 'not_payable';
  return undefined;
}

export const danceFunctions: Record<string, FunctionHandler> = {
  'prepare-enrolment-checkout': (body, ctx) => {
    let engagementId: string;
    if (body.mode === 'create_engagement') {
      if (!ctx.user) throw new DemoRpcError('Bearer auth required for create_engagement');
      engagementId = resolveOrCreateEngagement(ctx, body);
    } else {
      engagementId = String(body.engagement_id ?? '');
      const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
      if (!eng || (!canActFor(ctx, String(eng.person_id)) && !body.enrolment_token)) {
        throw new DemoRpcError('Engagement not found');
      }
    }
    const context = completionContext(ctx, engagementId);
    const reason = blockReason(String(context.status));
    if (body.phase === 'load' || reason) return { context, charge: null, ...(reason ? { blockReason: reason } : {}) };
    return { context, charge: offlineCharge(ctx, engagementId) };
  },

  'create-checkout': (body, ctx) => {
    const engagementId = String(body.engagement_id ?? '');
    const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
    if (!eng) throw new DemoRpcError('Engagement not found');
    return offlineCharge(ctx, engagementId);
  },

  'record-payment': recordPayment,

  /** Emails the guardian a link to finish a pending_payment enrolment. */
  'send-admin-enrolment-link': (body, ctx) => {
    requireAdmin(ctx);
    const eng = rows(ctx, 'engagements').find((e) => e.id === body.engagementId);
    if (!eng) throw new DemoRpcError('Engagement not found');
    const offering = rows(ctx, 'offerings').find((o) => o.id === eng.offering_id);
    const paymentUrl = `${appBase()}/enrol/pay/${String(eng.id)}`;
    if (!body.skipNotificationEmail) {
      sendToOutbox({
        to: String(body.recipientEmail ?? ''),
        subject: `Complete enrollment — ${String(offering?.name ?? '')}`,
        body: `Hi ${String(body.recipientName ?? '')}, the place is approved. Finish the enrolment here; this studio takes payment at the studio.`,
        link: { label: 'Complete enrolment', href: `#/enrol/pay/${String(eng.id)}` },
      });
    }
    return { success: true, paymentUrl, emailSent: !body.skipNotificationEmail };
  },

  /** Emails the guardian a link to sign the health declaration for a pending_waiver enrolment. */
  'send-admin-waiver-link': (body, ctx) => {
    requireAdmin(ctx);
    const eng = rows(ctx, 'engagements').find((e) => e.id === body.engagementId);
    if (!eng) throw new DemoRpcError('Engagement not found');
    const signUrl = `${appBase()}/enrol/complete?engagementId=${encodeURIComponent(String(eng.id))}`;
    sendToOutbox({
      to: String(body.recipientEmail ?? ''),
      subject: 'Please sign the health declaration',
      body: `Hi ${String(body.recipientName ?? '')}, please read and sign the health declaration to complete the enrolment.`,
      link: { label: 'Sign the health declaration', href: `#/enrol/complete?engagementId=${encodeURIComponent(String(eng.id))}` },
    });
    return { signUrl, emailSent: true };
  },

  // Resume state only matters across real page loads; the demo resets on refresh.
  'save-enrolment-resume': () => ({ ok: true }),
  'load-enrolment-resume': () => ({ state: null }),
  'clear-enrolment-resume': () => ({ ok: true }),
};

/** _shared/engagement-waiver.ts: is there signed evidence for this enrolment's person? */
function hasSignedWaiver(ctx: DemoContext, eng: Row): boolean {
  const evidence = rows(ctx, 'waiver_evidence');
  if (eng.waiver_evidence_id && evidence.some((w) => w.id === eng.waiver_evidence_id)) return true;
  return evidence.some((w) => w.person_id === eng.person_id && w.offering_id === eng.offering_id && w.status === 'signed');
}

/**
 * record-payment + _shared/payments/finalise-payment.ts: an admin records a
 * cash or bank-transfer payment for a pending_payment enrolment. Provider
 * 'manual', no tax document (invoicing off). The place becomes active, or
 * pending_waiver with a 7-day deadline when the declaration is not signed yet.
 */
/**
 * Demo of a monthly fee paid at the studio for an active monthly enrolment (record-payment's
 * renewal path): each recording pays the next month after the last one recorded.
 */
function recordDemoMonthlyPayment(eng: Row, method: string, body: Row, ctx: DemoContext): Row {
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng.offering_id);
  if (!offering || offering.billing_mode !== 'recurring') {
    throw new DemoRpcError('This enrolment has no monthly plan to record a payment for');
  }
  const paid = rows(ctx, 'payments').filter((p) => p.engagement_id === eng.id && p.status === 'succeeded');
  const first = new Date(String(paid[0]?.paid_at ?? ctx.now()));
  const due = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + paid.length, 1));
  const period = due.toISOString().slice(0, 7);
  const now = ctx.now();
  const payment = {
    id: ctx.uuid(), tenant_id: TENANT_ID, account_id: null, person_id: eng.person_id,
    offering_id: eng.offering_id, engagement_id: eng.id, billing_account_id: eng.billing_account_id,
    charge_type: 'renewal', provider: 'manual', provider_payment_ref: `manual_renewal_${String(eng.id)}_${period}`,
    payment_method: method, pretax_amount_minor: 0, vat_rate: 0, vat_amount_minor: 0,
    total_amount_minor: Number(body.amount_minor ?? offering.price_minor ?? 0), currency: String(offering.currency ?? 'ILS').toUpperCase(),
    status: 'succeeded', paid_at: now, description: (body.note as string | undefined) ?? `Monthly fee ${period}`,
    created_by: ctx.user?.id ?? null, approved_by: ctx.user?.id ?? null, external_document_number: null,
    invoice_url: null, created_at: now, updated_at: now,
  };
  rows(ctx, 'payments').push(payment);
  setTimeout(() => void queryClient.invalidateQueries(), 0);
  return { ok: true, paymentId: payment.id, period };
}

function recordPayment(body: Row, ctx: DemoContext): Row {
  requireAdmin(ctx);
  const method = String(body.method ?? '');
  if (method !== 'cash' && method !== 'bank_transfer' && method !== 'bit') throw new DemoRpcError('Invalid request body');
  const eng = rows(ctx, 'engagements').find((e) => e.id === body.engagement_id);
  if (!eng) throw new DemoRpcError('Engagement not found');
  if (eng.status === 'active') return recordDemoMonthlyPayment(eng, method, body, ctx);
  if (eng.status !== 'pending_payment') throw new DemoRpcError('Engagement is not pending payment');
  eng.billing_account_id ??= ensureBillingAccount(ctx, String(eng.person_id));
  if (rows(ctx, 'payments').some((p) => p.engagement_id === eng.id && p.status === 'succeeded')) {
    throw new DemoRpcError('Payment already recorded');
  }
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng.offering_id);
  const person = rows(ctx, 'people').find((p) => p.id === eng.person_id);
  if (!offering) throw new DemoRpcError('Offering or tenant not found');
  const now = ctx.now();
  const payment = {
    id: ctx.uuid(), tenant_id: TENANT_ID, account_id: person?.account_id ?? null, person_id: eng.person_id,
    offering_id: eng.offering_id, engagement_id: eng.id, billing_account_id: eng.billing_account_id,
    charge_type: 'initial', provider: 'manual', provider_payment_ref: `manual_${String(eng.id)}_${Date.now()}`,
    payment_method: method, pretax_amount_minor: 0, vat_rate: 0, vat_amount_minor: 0,
    total_amount_minor: Number(body.amount_minor ?? offering.price_minor ?? 0), currency: String(offering.currency ?? 'ILS').toUpperCase(),
    status: 'succeeded', paid_at: now, description: (body.note as string | undefined) ?? `Manual ${method} payment`,
    created_by: ctx.user?.id ?? null, approved_by: ctx.user?.id ?? null, external_document_number: null,
    invoice_url: null, created_at: now, updated_at: now,
  };
  rows(ctx, 'payments').push(payment);
  const signed = !offering.waiver_required || hasSignedWaiver(ctx, eng);
  eng.status = signed ? 'active' : 'pending_waiver';
  eng.billing_status = 'current';
  eng.payment_received_at = now;
  eng.payment_dunning_attempt_count = 0;
  if (!signed) eng.waiver_deadline = new Date(Date.now() + 7 * 86_400_000).toISOString();
  eng.updated_at = now;
  // Demo only: the app refreshes just the student panel after a payment (reported
  // as an app gap), so the Students list and Finance would show old numbers.
  setTimeout(() => void queryClient.invalidateQueries(), 0);
  return { ok: true, paymentId: payment.id };
}

export const danceRpcs: Record<string, RpcHandler> = {
  /** Saved cards on a billing account (payment_method_tokens). Pay-at-the-studio accounts have none. */
  get_billing_account_payment_method: (args, ctx) => {
    const ba = rows(ctx, 'billing_accounts').find((b) => b.id === args.p_billing_account_id);
    if (!ba || !ctx.user) return [];
    if (!isAdmin(ctx) && !canRead('billing_accounts', ba, ctx)) return [];
    return rows(ctx, 'payment_method_tokens')
      .filter((t) => t.billing_account_id === ba.id)
      .map((t) => ({ card_brand: t.card_brand, last4: t.last4, exp_month: t.exp_month, exp_year: t.exp_year, is_default: t.is_default }));
  },

  get_engagement_person_id: (args, ctx) => {
    const eng = rows(ctx, 'engagements').find((e) => e.id === args.p_engagement_id);
    return eng && canActFor(ctx, String(eng.person_id)) ? eng.person_id : null;
  },

  /** Like the SQL: admin approves an admin_review place (age outside the range). */
  approve_age_review_engagement: (args, ctx) => {
    requireAdmin(ctx);
    const eng = rows(ctx, 'engagements').find((e) => e.id === args.p_engagement_id);
    if (!eng || eng.status !== 'admin_review') throw new DemoRpcError('Engagement is not awaiting review');
    eng.status = 'pending_payment';
    eng.age_override_at = ctx.now();
    eng.age_override_by = ctx.user?.id ?? null;
    eng.age_override_reason = (args.p_admin_reason as string | null) ?? null;
    eng.updated_at = ctx.now();
    return { ...eng };
  },

  decline_age_review_engagement: (args, ctx) => {
    requireAdmin(ctx);
    const eng = rows(ctx, 'engagements').find((e) => e.id === args.p_engagement_id);
    if (!eng || eng.status !== 'admin_review') throw new DemoRpcError('Engagement is not awaiting review');
    eng.status = 'cancelled';
    eng.cancelled_at = ctx.now();
    eng.cancellation_reason = (args.p_reason as string | null) ?? 'Age review declined';
    eng.updated_at = ctx.now();
    return { ...eng };
  },

  /** Like the SQL: pre-payment states only, never once a payment succeeded. */
  cancel_engagement: (args, ctx) => {
    if (!ctx.user) throw new DemoRpcError('Authentication required');
    const eng = rows(ctx, 'engagements').find((e) => e.id === args.p_engagement_id);
    if (!eng || !canActFor(ctx, String(eng.person_id))) throw new DemoRpcError('Engagement not found');
    if (eng.status === 'cancelled') return { ...eng };
    if (!['pending_payment', 'admin_review', 'pending_offer', 'pending_waiver'].includes(String(eng.status))) {
      throw new DemoRpcError(`Engagement cannot be cancelled from status ${String(eng.status)}`);
    }
    if (eng.payment_received_at) throw new DemoRpcError('Engagement already has payment recorded');
    if (rows(ctx, 'payments').some((p) => p.engagement_id === eng.id && p.status === 'succeeded')) {
      throw new DemoRpcError('Engagement has a succeeded payment');
    }
    eng.status = 'cancelled';
    eng.cancelled_at = ctx.now();
    eng.cancelled_by = ctx.user?.id ?? null;
    eng.cancellation_reason = (args.p_reason as string | null) ?? null;
    eng.updated_at = ctx.now();
    return { ...eng };
  },

  /** Cancels an ACTIVE (paid) place; in the app this also stops its monthly plan. */
  cancel_active_engagement: (args, ctx) => {
    requireAdmin(ctx);
    const eng = rows(ctx, 'engagements').find((e) => e.id === args.p_engagement_id);
    if (!eng) throw new DemoRpcError('Engagement not found');
    if (eng.status === 'cancelled') return { ...eng };
    if (eng.status !== 'active') {
      throw new DemoRpcError(`Engagement cannot be cancelled from status ${String(eng.status)}`);
    }
    eng.status = 'cancelled';
    eng.cancelled_at = ctx.now();
    eng.cancelled_by = ctx.user?.id ?? null;
    eng.cancellation_reason = (args.p_reason as string | null) ?? null;
    eng.updated_at = ctx.now();
    return { ...eng };
  },
};

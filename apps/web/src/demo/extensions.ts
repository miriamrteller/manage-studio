/**
 * Demo backend for the payment-requests / gallery-gating work (migration
 * 20261030000200) and quotes / automatic emails (20261030000300). Mirrors the
 * SQL and Edge Functions closely enough for the demo; money never moves and
 * emails go to the demo outbox.
 */
import queryClient from '@/lib/query-client';
import {
  DemoRpcError,
  type DemoContext,
  type FakeHooks,
  type FunctionHandler,
  type Row,
  type RpcHandler,
  type ViewHandler,
} from './fakeSupabase';
import { contractSignHref, demoContractSignPath, demoDepositRequest, formatIls } from './functions';
import { showInvoice } from './invoice';
import { sendToOutbox } from './outbox';
import { insertJob, resolveClient } from './rpcs';
import { canRead } from './rls';
import { ADMIN_USER_ID, DEMO_INVOICE_HOST, TENANT_ID } from './seed';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

function isAdmin(ctx: DemoContext): boolean {
  const p = rows(ctx, 'user_profiles').find((u) => u.id === ctx.user?.id);
  return Array.isArray(p?.role) && (p?.role as string[]).includes('tenant_admin');
}

function requireAdmin(ctx: DemoContext, fn: string) {
  if (!isAdmin(ctx)) throw new DemoRpcError(`${fn}: tenant_admin role required`);
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** In-app link (works under any base URL, hash routing). */
function appLink(path: string): string {
  return `#${path}`;
}

function emailEnabled(ctx: DemoContext, key: string): boolean {
  const row = rows(ctx, 'tenant_automatic_emails').find((r) => r.email_key === key);
  return row ? Boolean(row.enabled) : true;
}

function clientOf(ctx: DemoContext, engagementId: string): { name: string; email: string; personId: string } {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  const person = rows(ctx, 'people').find((p) => p.id === eng?.person_id);
  return { name: String(person?.name ?? ''), email: String(person?.email ?? ''), personId: String(person?.id ?? '') };
}

// ---------------------------------------------------------------------------
// payment requests and gallery
// ---------------------------------------------------------------------------

function allPaid(ctx: DemoContext, engagementId: string): boolean {
  const live = rows(ctx, 'job_payment_requests').filter(
    (r) => r.engagement_id === engagementId && r.status !== 'cancelled',
  );
  return live.length > 0 && live.every((r) => r.status === 'paid' || r.status === 'refunded_manual');
}

function galleryState(ctx: DemoContext, engagementId: string): Row {
  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  if (!eng) throw new DemoRpcError('get_client_job_gallery: job not found');
  const job = rows(ctx, 'job_details').find((j) => j.engagement_id === engagementId);
  const paid = allPaid(ctx, engagementId);
  const outstanding = rows(ctx, 'job_payment_requests')
    .filter((r) => r.engagement_id === engagementId && (r.status === 'pending' || r.status === 'sent'))
    .reduce((sum, r) => sum + Number(r.amount_minor), 0);
  const releasedAt = job?.gallery_released_at ?? null;
  const released = releasedAt != null || paid;
  const url = (job?.gallery_url as string | null) ?? null;
  return {
    engagement_id: engagementId,
    released,
    released_by_admin: releasedAt != null,
    all_paid: paid,
    outstanding_minor: outstanding,
    has_gallery: Boolean(url),
    gallery_url: released ? url : null,
  };
}

function maybeGalleryReadyEmail(ctx: DemoContext, engagementId: string) {
  const state = galleryState(ctx, engagementId);
  if (!state.released || !state.has_gallery || !emailEnabled(ctx, 'gallery_ready')) return;
  const c = clientOf(ctx, engagementId);
  sendToOutbox({
    to: c.email,
    subject: 'Your gallery is ready',
    body: `Hi ${c.name}, your photos are ready to view and download.`,
    link: { label: 'Open the gallery', href: String(state.gallery_url) },
  });
}

/** Marks a request paid with a new payments row; returns the payment id. */
function settleRequest(ctx: DemoContext, req: Row, method: string, provider: string): string {
  if (req.status !== 'pending' && req.status !== 'sent') {
    throw new DemoRpcError('This payment request is not open');
  }
  const eng = rows(ctx, 'engagements').find((e) => e.id === req.engagement_id);
  const person = rows(ctx, 'people').find((p) => p.id === eng?.person_id);
  const offering = rows(ctx, 'offerings').find((o) => o.id === eng?.offering_id);
  const paymentId = ctx.uuid();
  const total = Number(req.amount_minor);
  const docNumber = String(30500 + rows(ctx, 'payments').length);
  rows(ctx, 'payments').push({
    id: paymentId,
    tenant_id: TENANT_ID,
    engagement_id: req.engagement_id,
    person_id: eng?.person_id ?? null,
    account_id: person?.account_id ?? null,
    offering_id: eng?.offering_id ?? null,
    total_amount_minor: total,
    pretax_amount_minor: Math.round(total / 1.18),
    vat_amount_minor: total - Math.round(total / 1.18),
    vat_rate: 18,
    currency: req.currency,
    status: 'succeeded',
    charge_type: 'one_time',
    provider,
    payment_method: method,
    description: `${offering?.name ?? 'Shoot'}: ${req.label}`,
    paid_at: ctx.now(),
    created_at: ctx.now(),
    external_document_number: docNumber,
    invoice_url: `${DEMO_INVOICE_HOST}/${paymentId}`,
  });
  Object.assign(req, { status: 'paid', paid_at: ctx.now(), payment_id: paymentId, updated_at: ctx.now() });
  maybeGalleryReadyEmail(ctx, req.engagement_id as string);
  return paymentId;
}

export function invoiceForPayment(ctx: DemoContext, paymentId: string) {
  const p = rows(ctx, 'payments').find((x) => x.id === paymentId);
  if (!p) return null;
  const person = rows(ctx, 'people').find((x) => x.id === p.person_id);
  return {
    number: String(p.external_document_number ?? ''),
    clientName: String(person?.name ?? ''),
    description: String(p.description ?? ''),
    amountMinor: Number(p.total_amount_minor),
    paidAt: String(p.paid_at ?? p.created_at),
    method: String(p.payment_method ?? 'card'),
  };
}

function publicRequest(ctx: DemoContext, req: Row): Row {
  const eng = rows(ctx, 'engagements').find((e) => e.id === req.engagement_id);
  const tenant = rows(ctx, 'tenants')[0];
  return {
    id: req.id,
    label: req.label,
    amountMinor: req.amount_minor,
    currency: req.currency,
    dueDate: req.due_date,
    status: req.status,
    paidAt: req.paid_at,
    maxInstallments: req.max_installments,
    jobDate: eng?.booked_starts_at ? String(eng.booked_starts_at).slice(0, 10) : null,
    jobCancelled: eng?.status === 'cancelled',
    studio: {
      name: tenant?.name,
      language: tenant?.language_default === 'he' ? 'he' : 'en',
      primaryColor: tenant?.primary_color ?? null,
      accentColor: tenant?.accent_color ?? null,
      logoUrl: tenant?.logo_url ?? null,
    },
    paymentProvider: 'ypay',
  };
}

// ---------------------------------------------------------------------------
// quotes
// ---------------------------------------------------------------------------

export function recalcQuote(ctx: DemoContext, quote: Row) {
  const lines = rows(ctx, 'quote_lines').filter((l) => l.quote_id === quote.id);
  for (const l of lines) l.line_total_minor = Number(l.qty) * Number(l.unit_price_minor);
  const required = lines.filter((l) => !l.is_optional).reduce((s, l) => s + Number(l.line_total_minor), 0);
  const optional = lines.filter((l) => l.is_optional && l.is_selected).reduce((s, l) => s + Number(l.line_total_minor), 0);
  const total = required + optional;
  const deposit = Math.floor((total * Number(quote.deposit_percent) + 50) / 100);
  Object.assign(quote, {
    required_minor: required,
    optional_selected_minor: optional,
    total_minor: total,
    deposit_minor: deposit,
    balance_minor: total - deposit,
  });
}

function quoteLines(ctx: DemoContext, quoteId: unknown): Row[] {
  return rows(ctx, 'quote_lines')
    .filter((l) => l.quote_id === quoteId)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((l) => ({
      id: l.id, offering_id: l.offering_id, description: l.description, qty: l.qty,
      unit_price_minor: l.unit_price_minor, line_total_minor: l.line_total_minor,
      is_optional: l.is_optional, is_selected: l.is_selected, sort_order: l.sort_order,
    }));
}

function quoteContact(ctx: DemoContext, q: Row): { client_name: string | null; client_email: string | null; client_phone: string | null } {
  const lead = rows(ctx, 'leads').find((l) => l.id === q.lead_id);
  const account = rows(ctx, 'accounts').find((a) => a.id === q.account_id);
  const ap = rows(ctx, 'people').find((p) => p.id === account?.person_id);
  const eng = rows(ctx, 'engagements').find((e) => e.id === q.engagement_id);
  const ep = rows(ctx, 'people').find((p) => p.id === eng?.person_id);
  const person = ap ?? ep;
  const phone = rows(ctx, 'contact_preferences').find((c) => c.person_id === person?.id)?.whatsapp_number;
  return {
    client_name: (lead?.name ?? account?.name ?? ap?.name ?? ep?.name ?? null) as string | null,
    client_email: (lead?.email ?? ap?.email ?? ep?.email ?? null) as string | null,
    client_phone: (lead?.phone ?? phone ?? null) as string | null,
  };
}

function quoteOfferingId(ctx: DemoContext, q: Row): string | null {
  const line = rows(ctx, 'quote_lines')
    .filter((l) => l.quote_id === q.id && l.offering_id && !l.is_optional)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))[0];
  if (line) return line.offering_id as string;
  const lead = rows(ctx, 'leads').find((l) => l.id === q.lead_id);
  if (lead?.offering_id) return lead.offering_id as string;
  const custom = rows(ctx, 'offerings').find((o) => !o.is_public && Number(o.price_minor) === 0);
  return (custom?.id as string | undefined) ?? null;
}

function publicQuoteStatus(q: Row): string {
  if (q.status === 'sent' && q.valid_until && String(q.valid_until) < today()) return 'expired';
  return String(q.status);
}

function findQuoteByToken(ctx: DemoContext, token: unknown): Row | undefined {
  return rows(ctx, 'quotes').find((q) => q.public_token === token && q.tenant_id === TENANT_ID);
}

function acceptQuote(ctx: DemoContext, token: string, selected: string[]): Row {
  const q = findQuoteByToken(ctx, token);
  if (!q || q.status === 'draft') return { ok: false, code: 'not_found' };
  if (q.status === 'accepted') return { ...(q.accepted_result as Row), already_accepted: true };
  if (q.status !== 'sent') return { ok: false, code: 'not_open', status: q.status };
  if (q.valid_until && String(q.valid_until) < today()) {
    q.status = 'expired';
    return { ok: false, code: 'expired' };
  }
  const lines = rows(ctx, 'quote_lines').filter((l) => l.quote_id === q.id);
  if (selected.some((id) => !lines.some((l) => l.id === id && l.is_optional))) return { ok: false, code: 'invalid_selection' };

  let offering: string | null = null;
  if (q.engagement_id) {
    const job = rows(ctx, 'job_details').find((j) => j.engagement_id === q.engagement_id);
    if (job?.job_status === 'cancelled') return { ok: false, code: 'shoot_cancelled' };
  } else {
    offering = quoteOfferingId(ctx, q);
    if (!offering) return { ok: false, code: 'no_package' };
  }

  for (const l of lines) l.is_selected = !l.is_optional || selected.includes(l.id as string);
  recalcQuote(ctx, q);

  let engagementId = q.engagement_id as string | null;
  if (!engagementId) {
    const lead = rows(ctx, 'leads').find((l) => l.id === q.lead_id) as Row;
    const client = resolveClient(ctx, { name: lead.name as string, email: lead.email as string, phone: lead.phone as string });
    const existing = rows(ctx, 'job_details').find((j) => j.lead_id === lead.id && j.job_status !== 'cancelled');
    engagementId =
      (existing?.engagement_id as string | undefined) ??
      insertJob(ctx, {
        personId: client.person_id,
        offeringId: offering as string,
        notes: (q.notes ?? lead.note ?? lead.interest) as string | null,
        leadId: lead.id as string,
      });
    if (!lead.converted_account_id) {
      Object.assign(lead, { converted_account_id: client.account_id, converted_at: ctx.now(), updated_at: ctx.now() });
    }
    q.account_id = q.account_id ?? client.account_id;
  }
  const job = rows(ctx, 'job_details').find((j) => j.engagement_id === engagementId);
  if (job && (job.job_status === 'enquiry' || job.job_status === 'booked')) job.job_status = 'booked';

  const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
  const shootDate = (q.shoot_date as string | null) ?? (eng?.booked_starts_at ? String(eng.booked_starts_at).slice(0, 10) : null);
  const balanceDue = shootDate && shootDate > today() ? shootDate : today();
  const requests: Row[] = [];
  if (Number(q.deposit_minor) > 0) {
    requests.push({ label: 'Deposit', amount_minor: q.deposit_minor, due_date: today(), max_installments: 1 });
  }
  if (Number(q.balance_minor) > 0) {
    requests.push({ label: 'Balance', amount_minor: q.balance_minor, due_date: balanceDue, max_installments: q.balance_max_installments });
  }
  const ids = requests.map((r) => insertRequest(ctx, engagementId as string, r, null).id);

  const result: Row = {
    ok: true, quote_id: q.id, engagement_id: engagementId, converted_lead: q.engagement_id == null,
    total_minor: q.total_minor, deposit_minor: q.deposit_minor, balance_minor: q.balance_minor,
    currency: q.currency, shoot_date: shootDate, balance_due_date: balanceDue,
    payment_requests: requests, payment_request_ids: ids, send_contract: q.send_contract_on_accept,
  };
  Object.assign(q, { status: 'accepted', accepted_at: ctx.now(), engagement_id: engagementId, accepted_result: result });

  const contact = quoteContact(ctx, q);
  if (contact.client_email && emailEnabled(ctx, 'booking_confirmed')) {
    const deposit = demoDepositRequest(ctx, engagementId as string);
    const signPath = demoContractSignPath(ctx, engagementId as string);
    // Same order as the real email: sign the contract first, then pay the deposit.
    sendToOutbox({
      to: contact.client_email,
      subject: 'Your booking is confirmed',
      body: `Hi ${contact.client_name ?? ''}, thank you for accepting the quote (${formatIls(Number(q.total_minor))}). ` +
        (signPath ? 'Step 1: sign the contract. ' : '') +
        (deposit ? `${signPath ? 'Step 2: pay' : 'Pay'} the deposit of ${formatIls(Number(deposit.amount_minor))}, due today.` : ''),
      link: signPath
        ? { label: 'Sign the contract', href: appLink(signPath) }
        : deposit ? { label: 'Pay the deposit', href: appLink(`/pay/${deposit.public_token}`) } : undefined,
    });
  }
  return { ...result, already_accepted: false };
}

function insertRequest(ctx: DemoContext, engagementId: string, r: Row, createdBy: string | null): Row {
  const label = String(r.label ?? '').trim();
  const amount = Number(r.amount_minor);
  if (!label) throw new DemoRpcError('create_job_payment_requests: label is required');
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new DemoRpcError(`create_job_payment_requests: amount_minor must be a positive integer (label ${label})`);
  }
  const row: Row = {
    id: ctx.uuid(), tenant_id: TENANT_ID, engagement_id: engagementId, label, amount_minor: amount,
    currency: 'ILS', due_date: (r.due_date as string | null) || null, status: 'pending', payment_id: null,
    sent_at: null, paid_at: null, max_installments: Number(r.max_installments ?? 1), public_token: randomHex(24),
    due_reminder_sent_at: null, overdue_reminder_sent_at: null, refunded_at: null, refund_note: null,
    created_by: createdBy, created_at: ctx.now(), updated_at: ctx.now(),
  };
  rows(ctx, 'job_payment_requests').push(row);
  return row;
}

// ---------------------------------------------------------------------------
// client search (search_enrolment_students, 20260608002200_admin_enrolment_rpcs)
// ---------------------------------------------------------------------------

const digitsOnly = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');
/** Israeli numbers: international 972X… and local 0X… compare as the local form. */
const localPhoneDigits = (digits: string) => (digits.startsWith('972') ? `0${digits.slice(3)}` : digits);
const LIVE_ENGAGEMENT = new Set(['active', 'pending_payment', 'admin_review', 'pending_waiver']);

/**
 * Mirrors the SQL: active people in the tenant; every whitespace token must
 * occur in a lower-cased blob of name / email / emergency contact / account
 * name / guardian / package names, or (3+ digits) in a digits-only phone.
 * Also matches the client's WhatsApp number (contact_preferences), where
 * photographer client phones are stored, and treats a local Israeli number
 * (0X…) and the international form (+972 X…) as the same number
 * (mirrors migration 20261030000400).
 */
export function searchClients(ctx: DemoContext, query: string, limit: number): Row[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const digits = digitsOnly(normalized);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const people = rows(ctx, 'people');
  const holders = rows(ctx, 'account_members').filter((m) => m.role === 'account_holder');

  const matches = people
    .filter((p) => p.tenant_id === TENANT_ID && (p.status ?? 'active') === 'active')
    .map((p) => {
      const account = rows(ctx, 'accounts').find((a) => a.id === p.account_id);
      const holder = holders.find((m) => m.account_id === p.account_id);
      const guardian = people.find((g) => g.id === holder?.person_id);
      const classNames = [
        ...new Set(
          rows(ctx, 'engagements')
            .filter((e) => e.person_id === p.id && LIVE_ENGAGEMENT.has(String(e.status)))
            .map((e) => String(rows(ctx, 'offerings').find((o) => o.id === e.offering_id)?.name ?? ''))
            .filter(Boolean),
        ),
      ].sort();
      const whatsapp = rows(ctx, 'contact_preferences').find((c) => c.person_id === p.id)?.whatsapp_number;
      const phones = [p.emergency_contact_phone, guardian?.emergency_contact_phone, whatsapp].map(digitsOnly);
      const blob = [
        p.name, p.email, p.emergency_contact_name, p.emergency_contact_phone, digitsOnly(p.emergency_contact_phone),
        account?.name, guardian?.name, guardian?.email, guardian?.emergency_contact_phone,
        digitsOnly(guardian?.emergency_contact_phone), whatsapp, digitsOnly(whatsapp), classNames.join(' '),
      ]
        .filter((v) => v != null && v !== '')
        .join(' ')
        .toLowerCase();
      const localDigits = localPhoneDigits(digits);
      const phoneMatch =
        digits.length >= 3 &&
        phones.some((ph) => ph !== '' && (ph.includes(digits) || localPhoneDigits(ph).includes(localDigits)));
      const ok = tokens.every((tok) => blob.includes(tok) || phoneMatch);
      return ok ? { p, account, guardian, classNames, isHolder: holders.some((m) => m.person_id === p.id) } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => String(a.p.name).localeCompare(String(b.p.name)))
    .slice(0, Math.max(1, Math.min(limit || 15, 50)));

  return matches.map(({ p, account, guardian, classNames, isHolder }) => ({
    person: {
      id: p.id, tenant_id: p.tenant_id, user_profile_id: p.user_profile_id ?? null, account_id: p.account_id ?? null,
      name: p.name, email: p.email ?? null, date_of_birth: p.date_of_birth ?? null,
      medical_notes: p.medical_notes ?? null, allergies: p.allergies ?? null,
      emergency_contact_name: p.emergency_contact_name ?? null, emergency_contact_phone: p.emergency_contact_phone ?? null,
      photo_consent: Boolean(p.photo_consent), media_consent: Boolean(p.media_consent), status: p.status ?? 'active',
      waiver_accepted_at: p.waiver_accepted_at ?? null, waiver_version: p.waiver_version ?? null,
      created_at: p.created_at, updated_at: p.updated_at ?? p.created_at,
    },
    accountName: account?.name ?? null,
    guardianName: guardian?.name ?? null,
    guardianEmail: guardian?.email ?? null,
    guardianPhone: guardian?.emergency_contact_phone ?? null,
    emergencyContactName: p.emergency_contact_name ?? null,
    emergencyContactPhone: p.emergency_contact_phone ?? null,
    activeClassNames: classNames,
    isAccountHolder: isHolder,
    familyAccountId: p.account_id ?? holders.find((m) => m.person_id === p.id)?.account_id ?? null,
  }));
}

/** client_job_details view (20261030000200): no gallery_url / notes, own jobs only. */
export const views: Record<string, ViewHandler> = {
  client_job_details: (ctx) =>
    rows(ctx, 'job_details')
      .filter((jd) => {
        if (isAdmin(ctx)) return true;
        const eng = rows(ctx, 'engagements').find((e) => e.id === jd.engagement_id);
        return Boolean(eng && ctx.user && canRead('engagements', eng, ctx));
      })
      .map((jd) => ({
        engagement_id: jd.engagement_id,
        tenant_id: jd.tenant_id,
        job_status: jd.job_status,
        location: jd.location ?? null,
        created_at: jd.created_at,
        updated_at: jd.updated_at,
        gallery_released: jd.gallery_released_at != null || allPaid(ctx, jd.engagement_id as string),
      })),
};

export const extraRpcs: Record<string, RpcHandler> = {
  search_enrolment_students: (args, ctx) => {
    if (!ctx.user) throw new DemoRpcError('Authentication required');
    if (!isAdmin(ctx)) throw new DemoRpcError('Forbidden');
    return searchClients(ctx, String(args.p_query ?? ''), Number(args.p_limit ?? 15));
  },

  create_job_payment_requests: (args, ctx) => {
    requireAdmin(ctx, 'create_job_payment_requests');
    const engagementId = String(args.p_engagement_id);
    if (!rows(ctx, 'engagements').some((e) => e.id === engagementId)) {
      throw new DemoRpcError('create_job_payment_requests: engagement not found');
    }
    const list = Array.isArray(args.p_requests) ? (args.p_requests as Row[]) : [];
    if (list.length === 0) throw new DemoRpcError('create_job_payment_requests: p_requests must be a non-empty array');
    return list.map((r) => insertRequest(ctx, engagementId, r, ctx.user?.id ?? ADMIN_USER_ID));
  },

  get_client_job_gallery: (args, ctx) => {
    if (!ctx.user) throw new DemoRpcError('get_client_job_gallery: access denied');
    return galleryState(ctx, String(args.p_engagement_id));
  },

  release_job_gallery: (args, ctx) => {
    requireAdmin(ctx, 'release_job_gallery');
    const id = String(args.p_engagement_id);
    const job = rows(ctx, 'job_details').find((j) => j.engagement_id === id);
    if (!job) throw new DemoRpcError('release_job_gallery: job not found');
    const release = args.p_release !== false;
    job.gallery_released_at = release ? ctx.now() : null;
    if (release) maybeGalleryReadyEmail(ctx, id);
    return galleryState(ctx, id);
  },

  list_admin_quotes: (_args, ctx) => {
    requireAdmin(ctx, 'list_admin_quotes');
    return rows(ctx, 'quotes')
      .filter((q) => q.tenant_id === TENANT_ID)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((q) => ({
        id: q.id, status: q.status, title: q.title, lead_id: q.lead_id, engagement_id: q.engagement_id,
        total_minor: q.total_minor, currency: q.currency, shoot_date: q.shoot_date, valid_until: q.valid_until,
        sent_at: q.sent_at, accepted_at: q.accepted_at, created_at: q.created_at,
        client_name: quoteContact(ctx, q).client_name,
      }));
  },

  get_admin_quote: (args, ctx) => {
    requireAdmin(ctx, 'get_admin_quote');
    const q = rows(ctx, 'quotes').find((x) => x.id === args.p_quote_id);
    if (!q) return null;
    return { ...q, ...quoteContact(ctx, q), lines: quoteLines(ctx, q.id) };
  },

  save_quote: (args, ctx) => {
    requireAdmin(ctx, 'save_quote');
    const input = (args.p_quote ?? {}) as Row;
    const lines = Array.isArray(args.p_lines) ? (args.p_lines as Row[]) : [];
    const leadId = (input.lead_id as string | null) || null;
    const engagementId = (input.engagement_id as string | null) || null;
    if (leadId && !rows(ctx, 'leads').some((l) => l.id === leadId)) throw new DemoRpcError('Lead not found');
    let accountId = (input.account_id as string | null) || null;
    if (engagementId) {
      const eng = rows(ctx, 'engagements').find((e) => e.id === engagementId);
      if (!eng) throw new DemoRpcError('Shoot not found');
      accountId = accountId ?? (rows(ctx, 'people').find((p) => p.id === eng.person_id)?.account_id as string | null);
    }
    const fields: Row = {
      lead_id: leadId, account_id: accountId, engagement_id: engagementId,
      title: (input.title as string | null)?.trim() || null,
      shoot_date: input.shoot_date || null, valid_until: input.valid_until || null,
      notes: (input.notes as string | null)?.trim() || null,
      deposit_percent: Number(input.deposit_percent ?? 30),
      balance_max_installments: Number(input.balance_max_installments ?? 1),
      send_contract_on_accept: Boolean(input.send_contract_on_accept),
      updated_at: ctx.now(),
    };
    let q = input.id ? rows(ctx, 'quotes').find((x) => x.id === input.id) : undefined;
    if (input.id && !q) throw new DemoRpcError('Quote not found');
    if (q) {
      if (q.status !== 'draft' && q.status !== 'sent') {
        throw new DemoRpcError(`Quote is ${String(q.status)} and can no longer be edited`);
      }
      Object.assign(q, fields);
      ctx.db.quote_lines = rows(ctx, 'quote_lines').filter((l) => l.quote_id !== q?.id);
    } else {
      q = {
        id: ctx.uuid(), tenant_id: TENANT_ID, status: 'draft', public_token: randomHex(32), currency: 'ILS',
        sent_at: null, sent_via: null, accepted_at: null, accepted_result: null, declined_at: null,
        decline_reason: null, created_by: ctx.user?.id ?? null, created_at: ctx.now(), ...fields,
      };
      rows(ctx, 'quotes').push(q);
    }
    lines.forEach((l, i) => {
      const optional = Boolean(l.is_optional);
      rows(ctx, 'quote_lines').push({
        id: ctx.uuid(), tenant_id: TENANT_ID, quote_id: q?.id, offering_id: l.offering_id || null,
        description: String(l.description ?? '').trim(), qty: Number(l.qty ?? 1),
        unit_price_minor: Number(l.unit_price_minor), is_optional: optional,
        is_selected: !optional || Boolean(l.is_selected), sort_order: i + 1, created_at: ctx.now(),
      });
    });
    recalcQuote(ctx, q);
    return q.id;
  },

  mark_quote_sent: (args, ctx) => {
    requireAdmin(ctx, 'mark_quote_sent');
    const q = rows(ctx, 'quotes').find((x) => x.id === args.p_quote_id);
    if (!q) throw new DemoRpcError('Quote not found');
    if (q.status !== 'draft' && q.status !== 'sent') throw new DemoRpcError(`Quote is ${String(q.status)} and cannot be sent`);
    if (!rows(ctx, 'quote_lines').some((l) => l.quote_id === q.id)) throw new DemoRpcError('Add at least one line before sending');
    if (!q.engagement_id && !quoteOfferingId(ctx, q)) {
      throw new DemoRpcError("Add a package line (or set the lead's package) before sending");
    }
    Object.assign(q, { status: 'sent', sent_at: ctx.now(), sent_via: args.p_via });
    return { id: q.id, public_token: q.public_token, status: 'sent' };
  },

  get_public_quote: (args, ctx) => {
    const q = findQuoteByToken(ctx, args.p_token);
    if (!q || q.status === 'draft') return null;
    return {
      status: publicQuoteStatus(q), title: q.title, currency: q.currency, shoot_date: q.shoot_date,
      valid_until: q.valid_until, notes: q.notes, deposit_percent: q.deposit_percent,
      balance_max_installments: q.balance_max_installments, required_minor: q.required_minor,
      optional_selected_minor: q.optional_selected_minor, total_minor: q.total_minor,
      deposit_minor: q.deposit_minor, balance_minor: q.balance_minor, accepted_at: q.accepted_at,
      client_name: quoteContact(ctx, q).client_name, lines: quoteLines(ctx, q.id),
    };
  },

  decline_public_quote: (args, ctx) => {
    const q = findQuoteByToken(ctx, args.p_token);
    if (!q || q.status === 'draft') return { ok: false, code: 'not_found' };
    if (q.status === 'declined') return { ok: true, status: 'declined' };
    if (q.status !== 'sent') return { ok: false, code: 'not_open', status: q.status };
    Object.assign(q, {
      status: 'declined', declined_at: ctx.now(),
      decline_reason: (args.p_reason as string | null)?.trim().slice(0, 2000) || null,
    });
    return { ok: true, status: 'declined' };
  },
};

export const extraFunctions: Record<string, FunctionHandler> = {
  'client-job-contract-link': (body, ctx) => {
    const id = String(body.engagementId ?? '');
    const eng = rows(ctx, 'engagements').find((e) => e.id === id);
    if (!eng || !ctx.user || !canRead('engagements', eng, ctx)) throw new DemoRpcError('Shoot not found');
    if (eng.waiver_evidence_id) throw new DemoRpcError('Contract already signed');
    // App-relative path, as the real function returns.
    return { signPath: contractSignHref(id).slice(1) };
  },

  'send-job-payment-link': (body, ctx) => {
    requireAdmin(ctx, 'send-job-payment-link');
    const req = rows(ctx, 'job_payment_requests').find((r) => r.id === body.request_id);
    if (!req) throw new DemoRpcError('Payment request not found');
    if (req.status !== 'pending' && req.status !== 'sent') throw new DemoRpcError('This payment request is not open');
    Object.assign(req, { status: 'sent', sent_at: ctx.now(), updated_at: ctx.now() });
    const c = clientOf(ctx, req.engagement_id as string);
    const href = appLink(`/pay/${req.public_token}`);
    sendToOutbox({
      to: c.email,
      subject: `Payment request: ${req.label} ${formatIls(Number(req.amount_minor))}`,
      body: `Hi ${c.name}, here is your secure payment link from Lumen & Light Photography.`,
      link: { label: 'Open the payment page', href },
    });
    return { recipientEmail: c.email, paymentUrl: href };
  },

  'record-job-payment': (body, ctx) => {
    requireAdmin(ctx, 'record-job-payment');
    const req = rows(ctx, 'job_payment_requests').find((r) => r.id === body.request_id);
    if (!req) throw new DemoRpcError('Payment request not found');
    const paymentId = settleRequest(ctx, req, String(body.method ?? 'cash'), 'manual');
    // Live: YPay /document issues the receipt and the app emails it to the client.
    const inv = invoiceForPayment(ctx, paymentId);
    const c = clientOf(ctx, req.engagement_id as string);
    if (inv) {
      sendToOutbox({
        to: c.email,
        subject: `Receipt ${inv.number} from Lumen & Light Photography`,
        body: `Hi ${c.name}, we received your payment of ${formatIls(inv.amountMinor)} for ${req.label}. Thank you!`,
        link: { label: 'Open the receipt', href: `${DEMO_INVOICE_HOST}/${paymentId}` },
      });
    }
    return { paymentId };
  },

  'process-refund': (body, ctx) => {
    requireAdmin(ctx, 'process-refund');
    const payment = rows(ctx, 'payments').find((p) => p.id === body.payment_id);
    if (!payment) throw new DemoRpcError('Payment not found');
    const refundId = ctx.uuid();
    rows(ctx, 'payments').push({
      ...payment, id: refundId, total_amount_minor: -Number(payment.total_amount_minor), status: 'succeeded',
      charge_type: 'refund', refunds_payment_id: payment.id, description: `Refund: ${String(payment.description)}`,
      paid_at: ctx.now(), created_at: ctx.now(), invoice_url: null,
    });
    payment.status = 'refunded';
    payment.refunded_at = ctx.now();
    const req = rows(ctx, 'job_payment_requests').find((r) => r.payment_id === payment.id);
    if (req) Object.assign(req, { status: 'refunded_manual', refunded_at: ctx.now(), refund_note: body.reason ?? null });
    return { refundPaymentId: refundId };
  },

  'job-payment-request-public': (body, ctx) => {
    const req = rows(ctx, 'job_payment_requests').find((r) => r.public_token === body.token);
    if (!req) throw new DemoRpcError('Payment request unavailable');
    if (body.action === 'create_charge') {
      // Stands in for the hosted payment page: the charge succeeds at once.
      const paymentId = settleRequest(ctx, req, 'card', 'ypay');
      const inv = invoiceForPayment(ctx, paymentId);
      if (inv) showInvoice(inv);
      // The live app comes back from the hosted page with a full reload; here
      // the SPA stays loaded, so drop cached portal data instead.
      setTimeout(() => void queryClient.invalidateQueries(), 0);
      return { request: publicRequest(ctx, req), pageUrl: appLink(`/pay/${req.public_token}?result=success`) };
    }
    return { request: publicRequest(ctx, req) };
  },

  'accept-quote': (body, ctx) => {
    const result = acceptQuote(ctx, String(body.token ?? ''), (body.selectedLineIds as string[] | undefined) ?? []);
    if (!result.ok) throw Object.assign(new DemoRpcError(String(result.code ?? 'not_open')), { body: result });
    // Next steps, as accept-quote returns them: sign, then pay the deposit.
    const engagementId = String(result.engagement_id);
    const contractSignPath = demoContractSignPath(ctx, engagementId);
    const deposit = demoDepositRequest(ctx, engagementId);
    const depositPayPath = deposit && (deposit.status === 'pending' || deposit.status === 'sent')
      ? `/pay/${String(deposit.public_token)}`
      : null;
    return {
      ...result,
      ...(contractSignPath ? { contractSignPath } : {}),
      ...(depositPayPath ? { depositPayPath } : {}),
    };
  },

  'send-notification': (body, ctx) => {
    const vars = (body.variables ?? {}) as Row;
    if (body.templateName === 'quote_sent' && !emailEnabled(ctx, 'quote_sent')) return { success: true, skipped: true };
    const quoteUrl = vars.quoteUrl as string | undefined;
    sendToOutbox({
      to: String(body.recipientEmail ?? body.recipientPhone ?? ''),
      subject: body.templateName === 'quote_sent' ? 'Your photography quote' : String(body.templateName ?? 'Message'),
      body: body.templateName === 'quote_sent'
        ? `Hi ${String(vars.recipientName ?? '')}, your quote (${String(vars.totalFormatted ?? '')}) is ready. Valid until ${String(vars.validUntil ?? '')}.`
        : 'Message from Lumen & Light Photography.',
      link: quoteUrl ? { label: 'View the quote', href: `#${quoteUrl.split('#')[1] ?? ''}` } : undefined,
    });
    return { success: true };
  },
};

export const hooks: FakeHooks = {
  canRead,
  onUnknown: (kind, name) => {
    console.warn(`[demo] unhandled ${kind}: ${name}`);
  },
};

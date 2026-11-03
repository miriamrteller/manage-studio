/**
 * In-browser versions of the database RPCs the photographer screens call.
 * They mirror the SQL in supabase/migrations closely enough for the demo:
 * same arguments, same return shapes, same main validation errors.
 */
import { DemoRpcError, type DemoContext, type RpcHandler, type Row } from './fakeSupabase';
import { TENANT_ID } from './seed';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

function requireAdmin(ctx: DemoContext): Row {
  if (!ctx.user) throw new DemoRpcError('Authentication required');
  const profile = rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id);
  const roles = (profile?.role as string[] | undefined) ?? [];
  if (!roles.includes('tenant_admin')) throw new DemoRpcError('Forbidden');
  return profile as Row;
}

function audit(ctx: DemoContext, action: string, entityType: string, entityId: string, after: Row = {}) {
  rows(ctx, 'audit_log').push({
    id: ctx.uuid(),
    tenant_id: TENANT_ID,
    actor_id: ctx.user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_state: after,
    created_at: ctx.now(),
  });
}

/** job_resolve_client: reuse a person by email, else create person + account. */
export function resolveClient(
  ctx: DemoContext,
  input: { personId?: string | null; name?: string | null; email?: string | null; phone?: string | null },
): { person_id: string; account_id: string; created: boolean } {
  const people = rows(ctx, 'people');
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;
  let person: Row | undefined;
  if (input.personId) {
    person = people.find((p) => p.id === input.personId && p.tenant_id === TENANT_ID);
    if (!person) throw new DemoRpcError('Client not found');
  } else if (email) {
    person = people.find((p) => String(p.email ?? '').toLowerCase() === email);
  }
  let created = false;
  if (!person) {
    if (!name) throw new DemoRpcError('Client name is required');
    const pid = ctx.uuid();
    const aid = ctx.uuid();
    person = {
      id: pid, tenant_id: TENANT_ID, name, email, status: 'active', account_id: aid, user_profile_id: null,
      date_of_birth: null, medical_notes: null, allergies: null, photo_consent: false, media_consent: false,
      created_at: ctx.now(), updated_at: ctx.now(),
    };
    people.push(person);
    rows(ctx, 'accounts').push({ id: aid, tenant_id: TENANT_ID, name, person_id: pid, created_at: ctx.now() });
    rows(ctx, 'account_members').push({
      id: ctx.uuid(), tenant_id: TENANT_ID, account_id: aid, person_id: pid, role: 'account_holder', user_profile_id: null,
    });
    created = true;
  }
  const phone = input.phone?.trim();
  if (phone) {
    const prefs = rows(ctx, 'contact_preferences');
    const existing = prefs.find((p) => p.person_id === person?.id);
    if (!existing) {
      prefs.push({
        id: ctx.uuid(), tenant_id: TENANT_ID, person_id: person.id, email_opted_in: true,
        whatsapp_number: phone, whatsapp_opted_in: false, whatsapp_verified: false,
      });
    } else if (!existing.whatsapp_number) {
      existing.whatsapp_number = phone;
    }
  }
  return { person_id: person.id as string, account_id: person.account_id as string, created };
}

/** job_insert: engagement + job_details pair. */
export function insertJob(
  ctx: DemoContext,
  input: {
    personId: string;
    offeringId: string;
    startsAt?: string | null;
    endsAt?: string | null;
    location?: string | null;
    notes?: string | null;
    leadId?: string | null;
  },
): string {
  const offering = rows(ctx, 'offerings').find((o) => o.id === input.offeringId);
  if (!offering) throw new DemoRpcError('Package not found');
  const starts = input.startsAt || null;
  let ends = starts ? input.endsAt || null : null;
  if (starts && !ends) {
    ends = new Date(new Date(starts).getTime() + Number(offering.duration_mins ?? 60) * 60_000).toISOString();
  }
  const eid = ctx.uuid();
  rows(ctx, 'engagements').push({
    id: eid, tenant_id: TENANT_ID, person_id: input.personId, offering_id: input.offeringId, season_id: null,
    status: 'active', booked_starts_at: starts, booked_ends_at: ends, waiver_evidence_id: null,
    created_at: ctx.now(), updated_at: ctx.now(),
  });
  rows(ctx, 'job_details').push({
    engagement_id: eid, tenant_id: TENANT_ID, job_status: starts ? 'booked' : 'enquiry',
    location: input.location?.trim() || null, notes: input.notes?.trim() || null, lead_id: input.leadId ?? null,
    gallery_url: null, gallery_released_at: null, created_at: ctx.now(), updated_at: ctx.now(),
  });
  return eid;
}

function tenantConfigRow(ctx: DemoContext): Row[] {
  const t = rows(ctx, 'tenants')[0];
  if (!t) return [];
  return [{ ...t, tenant_subdomain: t.subdomain }];
}

/** today_classes of get_admin_dashboard_overview: this weekday's active classes in the season. */
function todayClasses(ctx: DemoContext, seasonId: string): Row[] {
  const dow = new Date().getDay();
  const taking = new Set(['active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer']);
  return rows(ctx, 'offerings')
    .filter(
      (o) => o.tenant_id === TENANT_ID && o.season_id === seasonId && o.day_of_week === dow &&
        (o.status === 'active' || o.status === 'full'),
    )
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    .map((o) => ({
      id: o.id,
      name: o.name,
      start_time: o.start_time,
      end_time: o.end_time,
      location: o.location ?? null,
      max_capacity: o.max_capacity,
      enrolled_count: rows(ctx, 'engagements').filter((e) => e.offering_id === o.id && taking.has(String(e.status))).length,
      waitlist_count: rows(ctx, 'waitlist').filter((w) => w.offering_id === o.id).length,
      staff_name: rows(ctx, 'staff').find((s) => s.id === o.staff_id)?.name ?? null,
    }));
}

/** get_finance_summary for the demo tenant, dates as YYYY-MM-DD (inclusive). */
function financeSummary(ctx: DemoContext, start: string, end: string): Row {
  const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');
  const inRange = (v: unknown) => !!day(v) && day(v) >= start && day(v) <= end;
  const payments = rows(ctx, 'payments').filter((p) => p.tenant_id === TENANT_ID);
  const season = rows(ctx, 'seasons').find((s) => s.tenant_id === TENANT_ID && s.status === 'active');
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const sum = (list: Row[]) => list.reduce((acc, r) => acc + Number(r.total_amount_minor ?? 0), 0);
  return {
    net_revenue_minor: sum(
      payments.filter((p) => (p.status === 'succeeded' || p.status === 'partially_refunded') && inRange(p.paid_at)),
    ),
    payment_count: payments.filter(
      (p) => p.status === 'succeeded' && (p.charge_type === 'initial' || p.charge_type === 'renewal') && inRange(p.paid_at),
    ).length,
    outstanding_engagements: rows(ctx, 'engagements').filter(
      (e) => e.tenant_id === TENANT_ID && e.status === 'pending_payment' && (e.season_id ?? null) === (season?.id ?? null),
    ).length,
    failed_payments_7d: payments.filter((p) => p.status === 'failed' && String(p.created_at ?? '') >= weekAgo).length,
    net_expenses_minor: sum(rows(ctx, 'expenses').filter((x) => x.tenant_id === TENANT_ID && inRange(x.expense_date))),
  };
}

export const baseRpcs: Record<string, RpcHandler> = {
  get_tenant_config_by_subdomain: (_args, ctx) => tenantConfigRow(ctx),

  get_tenant_features: (_args, ctx) => (rows(ctx, 'tenants')[0]?.enabled_features as string[]) ?? [],

  /** Legal pages (/legal/:doc): the studio's legal details. */
  get_tenant_legal_profile: (args, ctx) => {
    const tenant = rows(ctx, 'tenants').find((t) => t.id === args.p_tenant_id);
    if (!tenant) return [];
    return [
      {
        tenant_id: tenant.id,
        name: tenant.name,
        contact_email: tenant.contact_email ?? '',
        skin: tenant.skin,
        legal_profile: tenant.legal_profile ?? {},
        legal_pages_published: tenant.legal_pages_published === true,
        legal_profile_updated_at: tenant.legal_profile_updated_at ?? null,
        legal_pack_required: tenant.legal_pack_required === true,
        legal_pack_acknowledged_at: tenant.legal_pack_acknowledged_at ?? null,
      },
    ];
  },

  // The demo studios use the generated drafts: no lawyer-reviewed uploads.
  get_tenant_legal_documents: () => [],

  record_legal_acceptance: (args) => (Array.isArray(args.p_documents) ? args.p_documents.length : 0),

  // The demo studio has "already accepted" the platform terms.
  get_platform_terms_acceptance: () => true,

  log_sensitive_read: () => null,

  // The demo studio has one active form for everyone.
  pick_active_consent_template: (_args, ctx) =>
    rows(ctx, 'consent_templates').filter((t) => t.status === 'active').slice(0, 1),

  export_tenant_data: (_args, ctx) => {
    requireAdmin(ctx);
    return { exported_at: new Date().toISOString(), format: 'opalswift-studio-export/v1', data: { people: rows(ctx, 'people') } };
  },

  /** Consent history (photo purposes, portfolio, marketing). Latest row per kind wins. */
  get_person_consents: (args, ctx) => {
    const latest = new Map<string, Row>();
    for (const r of rows(ctx, 'consent_records')) {
      if (r.person_id === args.p_person_id) latest.set(String(r.kind), r);
    }
    return [...latest.values()].map((r) => ({ kind: r.kind, granted: r.granted, wording: r.wording, source: r.source, created_at: r.created_at }));
  },

  record_consents: (args, ctx) => {
    const items = Array.isArray(args.p_items) ? (args.p_items as Row[]) : [];
    for (const item of items) {
      rows(ctx, 'consent_records').push({
        id: crypto.randomUUID(),
        tenant_id: args.p_tenant_id,
        person_id: args.p_person_id,
        kind: item.kind,
        granted: item.granted === true,
        wording: item.wording ?? null,
        source: args.p_source,
        created_at: new Date().toISOString(),
      });
    }
    return items.length;
  },

  get_my_tenant_id: () => TENANT_ID,

  get_my_profile: (_args, ctx) => {
    if (!ctx.user) return [];
    return rows(ctx, 'user_profiles').filter((p) => p.id === ctx.user?.id);
  },

  get_my_last_signer_details: (_args, ctx) => {
    const mine = rows(ctx, 'waiver_evidence')
      .filter((w) => w.signer_details && w.signed_by_email && w.signed_by_email === ctx.user?.email)
      .sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)))[0];
    const last = (mine?.signer_details as { signer?: unknown } | undefined)?.signer;
    if (last) return last;
    // No earlier signature in this visit: the demo parent's prefilled details, if the seed has them.
    const email = String(ctx.user?.email ?? '').toLowerCase();
    const profile = rows(ctx, 'demo_signer_profiles').find((p) => String(p.email).toLowerCase() === email);
    return profile?.signer ?? null;
  },

  get_signed_record_details: (args, ctx) =>
    rows(ctx, 'waiver_evidence').find((w) => w.id === args.p_evidence_id)?.signer_details ?? null,

  get_my_person_id: (_args, ctx) => rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id)?.person_id ?? null,

  check_subdomain_available: () => false,

  /** Public class list (Classes page). Like the SQL: active, public, offering_type 'class' only. */
  get_public_offerings_by_subdomain: (args, ctx) => {
    const tenant = rows(ctx, 'tenants').find((t) => t.subdomain === String(args.p_subdomain ?? '').trim());
    if (!tenant) return [];
    return rows(ctx, 'offerings')
      .filter((o) => o.tenant_id === tenant.id && o.offering_type === 'class' && o.is_public === true && o.status === 'active')
      .map((o) => ({ ...o, tenant_subdomain: tenant.subdomain, waiver_required: o.waiver_required ?? false }));
  },

  /** Like the SQL: appointment packages, only when online booking is switched on. */
  get_bookable_offerings_by_subdomain: (args, ctx) => {
    const sub = String(args.p_subdomain ?? '').trim();
    if (!sub) throw new DemoRpcError('p_subdomain is required');
    const tenant = rows(ctx, 'tenants').find((t) => t.subdomain === sub);
    if (!tenant) return [];
    const settings = rows(ctx, 'tenant_scheduling_settings').find((s) => s.tenant_id === tenant.id);
    if (settings?.is_booking_enabled !== true) return [];
    return rows(ctx, 'offerings')
      .filter((o) => o.tenant_id === tenant.id && o.offering_type === 'appointment' && o.status === 'active')
      .map((o) => ({
        id: o.id,
        name: o.name,
        duration_mins: o.duration_mins ?? settings.slot_duration_mins ?? null,
        price_minor: o.price_minor,
        currency: o.currency,
        location: o.location ?? null,
      }));
  },

  get_finance_summary: (args, ctx) => {
    requireAdmin(ctx);
    const start = String(args.p_start_date ?? '');
    const end = String(args.p_end_date ?? '');
    if (end < start) throw new DemoRpcError('Invalid date range');
    return [financeSummary(ctx, start, end)];
  },

  /** Like the SQL: raises P0001 without an active season (photographer tenants have none). */
  get_admin_dashboard_overview: (_args, ctx) => {
    requireAdmin(ctx);
    const season = rows(ctx, 'seasons')
      .filter((s) => s.tenant_id === TENANT_ID && s.status === 'active')
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
    if (!season) throw new DemoRpcError('No active season found for this tenant', 'P0001');
    const today = new Date().toISOString().slice(0, 10);
    const inSeason = rows(ctx, 'engagements').filter((e) => e.tenant_id === TENANT_ID && e.season_id === season.id);
    const count = (status: string) => inSeason.filter((e) => e.status === status).length;
    return {
      season_id: season.id,
      season_name: season.name ?? null,
      today_classes: todayClasses(ctx, season.id as string),
      term_enrolments_count: inSeason.filter((e) => e.status !== 'cancelled' && e.status !== 'withdrawn').length,
      admin_review_count: count('admin_review'),
      pending_payment_count: count('pending_payment'),
      finance: financeSummary(ctx, `${today.slice(0, 7)}-01`, today),
    };
  },

  create_job: (args, ctx) => {
    requireAdmin(ctx);
    if (!args.p_offering_id) throw new DemoRpcError('Package is required');
    const starts = (args.p_booked_starts_at as string | undefined) ?? null;
    const ends = (args.p_booked_ends_at as string | undefined) ?? null;
    if (starts && ends && ends <= starts) throw new DemoRpcError('End time must be after start time');
    const client = resolveClient(ctx, {
      personId: args.p_person_id as string | undefined,
      name: args.p_client_name as string | undefined,
      email: args.p_client_email as string | undefined,
      phone: args.p_client_phone as string | undefined,
    });
    const eid = insertJob(ctx, {
      personId: client.person_id,
      offeringId: args.p_offering_id as string,
      startsAt: starts,
      endsAt: ends,
      location: args.p_location as string | undefined,
      notes: args.p_notes as string | undefined,
    });
    audit(ctx, 'INSERT', 'job_details', eid, { person_id: client.person_id });
    return { engagement_id: eid, person_id: client.person_id, account_id: client.account_id, client_created: client.created };
  },

  convert_lead_to_job: (args, ctx) => {
    requireAdmin(ctx);
    const lead = rows(ctx, 'leads').find((l) => l.id === args.p_lead_id);
    if (!lead) throw new DemoRpcError('Lead not found');
    if (lead.converted_account_id) throw new DemoRpcError('Lead already converted');
    const offeringId = (args.p_offering_id as string | undefined) ?? (lead.offering_id as string | null);
    if (!offeringId) throw new DemoRpcError('Package is required');
    const client = resolveClient(ctx, {
      name: lead.name as string,
      email: lead.email as string | null,
      phone: lead.phone as string | null,
    });
    const notes = ((args.p_notes as string | undefined)?.trim() || (lead.note as string | null) || (lead.interest as string | null)) ?? null;
    const eid = insertJob(ctx, {
      personId: client.person_id,
      offeringId,
      startsAt: (args.p_booked_starts_at as string | undefined) ?? null,
      endsAt: (args.p_booked_ends_at as string | undefined) ?? null,
      location: args.p_location as string | undefined,
      notes,
      leadId: lead.id as string,
    });
    lead.converted_account_id = client.account_id;
    lead.converted_at = ctx.now();
    lead.updated_at = ctx.now();
    audit(ctx, 'UPDATE', 'leads', lead.id as string, { engagement_id: eid });
    return {
      engagement_id: eid,
      person_id: client.person_id,
      account_id: client.account_id,
      lead_id: lead.id,
      client_created: client.created,
    };
  },
};
